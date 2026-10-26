import { isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import {
  assuntoRegua,
  dataSaoPaulo,
  dentroDaJanela,
  diaSemanaIso,
  diasAtraso,
  horaSaoPaulo,
  passoCombina,
  rotuloPasso,
  somarDias,
  textoRegua,
} from "@/lib/regua";
import { prisma } from "@/server/db";
import { dispararLembrete, registrarIgnorado, textoErroEnvio } from "@/server/regua/envio";
import { clienteResendPadrao, remetenteResend, type ClienteResend } from "@/server/regua/resend";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";

const ABERTAS = ["PENDING", "OVERDUE"];

export type ResultadoRegua = {
  enviados: number;
  ignorados: number;
  falhas: number;
};

function chaveOuNula(cifra: string | null): { chave: string | null; motivo: string | null } {
  if (!cifra) return { chave: null, motivo: "remetente não configurado" };
  try {
    return { chave: decifrarSegredoAsaas(cifra), motivo: null };
  } catch (erro) {
    textoErroEnvio(erro);
    return { chave: null, motivo: "chave ilegível" };
  }
}

export async function executarRegua(
  opcoes: { agora?: Date; empresaId?: string; resend?: ClienteResend } = {},
): Promise<ResultadoRegua> {
  const agora = opcoes.agora ?? new Date();
  const hoje = dataSaoPaulo(agora);
  const hora = horaSaoPaulo(agora);
  const dia = diaSemanaIso(hoje);
  const resend = opcoes.resend ?? clienteResendPadrao();
  const resultado: ResultadoRegua = { enviados: 0, ignorados: 0, falhas: 0 };

  const configs = await prisma.configuracaoRegua.findMany({
    where: { ativa: true, ...(opcoes.empresaId ? { empresaId: opcoes.empresaId } : {}) },
  });

  for (const config of configs) {
    const [reguas, faturas, dono, empresa] = await Promise.all([
      prisma.reguaCobranca.findMany({
        where: { empresaId: config.empresaId },
        include: { passos: { orderBy: { ordem: "asc" } } },
      }),
      prisma.fatura.findMany({
        where: { empresaId: config.empresaId, excluida: false, status: { in: ABERTAS } },
        include: {
          cliente: true,
          clienteServico: { select: { servico: { select: { nome: true } } } },
        },
      }),
      config.modoTeste
        ? prisma.usuario.findFirst({
            where: { empresaId: config.empresaId, papel: "DONO" },
            orderBy: { criadoEm: "asc" },
            select: { email: true },
          })
        : Promise.resolve(null),
      prisma.empresa.findUnique({ where: { id: config.empresaId }, select: { nomeFantasia: true } }),
    ]);

    const padrao = reguas.find((regua) => regua.padrao) ?? null;
    const segredo = chaveOuNula(config.chaveResendCifrada);
    const remetentePronto = Boolean(segredo.chave && config.remetenteEmail);
    const nomeEmpresa = empresa?.nomeFantasia ?? "";

    for (const fatura of faturas) {
      const cliente = fatura.cliente;
      let regua = padrao;
      if (cliente.reguaModo === "NENHUMA") {
        if (await registrarIgnorado({
          empresaId: config.empresaId,
          faturaId: fatura.id,
          clienteId: cliente.id,
          passoId: null,
          modoTeste: config.modoTeste,
          rotulo: "Sem régua",
          motivo: "sem régua",
        })) resultado.ignorados += 1;
        continue;
      }
      if (cliente.reguaModo === "ESPECIFICA") {
        regua = reguas.find((item) => item.id === cliente.reguaId) ?? null;
      }
      if (!regua) {
        if (await registrarIgnorado({
          empresaId: config.empresaId,
          faturaId: fatura.id,
          clienteId: cliente.id,
          passoId: null,
          modoTeste: config.modoTeste,
          rotulo: "Sem régua padrão",
          motivo: "sem régua padrão",
        })) resultado.ignorados += 1;
        continue;
      }

      if (!dentroDaJanela(hora, regua.horaInicio, regua.horaFim)) continue;
      if (!regua.enviarFimDeSemana && (dia === 0 || dia === 6)) continue;

      const vencimento = isoDeData(fatura.vencimento);
      const emissao = dataSaoPaulo(fatura.criadoEm);

      for (const passo of regua.passos) {
        if (passo.canal !== "EMAIL") continue;
        const alvo = passo.naEmissao ? emissao : somarDias(vencimento, passo.dias ?? 0);
        if (!passoCombina(hoje, alvo, regua.enviarFimDeSemana)) continue;

        const rotulo = rotuloPasso(passo);
        if (cliente.status === "BLOQUEADO") {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: config.modoTeste,
            rotulo,
            motivo: "cliente bloqueado",
          })) resultado.ignorados += 1;
          continue;
        }
        if (cliente.reguaPausada) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: config.modoTeste,
            rotulo,
            motivo: "régua pausada",
          })) resultado.ignorados += 1;
          continue;
        }

        const emailCliente = cliente.email.trim();
        if (!config.modoTeste && !emailCliente) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: false,
            rotulo,
            motivo: "cliente sem e-mail",
          })) resultado.ignorados += 1;
          continue;
        }
        if (config.modoTeste && !dono?.email) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: true,
            rotulo,
            motivo: "modo teste sem dono",
          })) resultado.ignorados += 1;
          continue;
        }
        if (!remetentePronto || !segredo.chave || !config.remetenteEmail) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: config.modoTeste,
            rotulo,
            motivo: segredo.motivo ?? "remetente não configurado",
          })) resultado.ignorados += 1;
          continue;
        }

        const corpo = textoRegua(passo.corpo, {
          cliente: cliente.nomeFantasia,
          servico: fatura.clienteServico?.servico.nome ?? fatura.descricao ?? "cobrança",
          valor: formatarReais(fatura.valor.toFixed(2)),
          vencimento: formatarDataIso(vencimento),
          link: fatura.boletoUrl ?? fatura.faturaUrl ?? "",
          diasAtraso: String(diasAtraso(hoje, vencimento)),
          empresa: nomeEmpresa,
        });
        const texto = config.modoTeste
          ? `Modo teste: este e-mail foi enviado para você, não para o cliente.\n\n${corpo}`
          : corpo;
        const envio = await dispararLembrete({
          empresaId: config.empresaId,
          faturaId: fatura.id,
          clienteId: cliente.id,
          passoId: passo.id,
          rotulo,
          automatico: true,
          modoTeste: config.modoTeste,
          destino: config.modoTeste ? dono!.email : emailCliente,
          assunto: assuntoRegua(passo.assunto, config.modoTeste),
          texto,
          de: remetenteResend(config.remetenteNome ?? "", config.remetenteEmail),
          replyTo: config.replyTo,
          chave: segredo.chave,
          resend,
        });
        if (envio.repetido) continue;
        if (envio.lembrete.status === "ENVIADO") resultado.enviados += 1;
        else resultado.falhas += 1;
      }
    }
  }

  return resultado;
}
