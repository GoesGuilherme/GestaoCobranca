import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { emailDeCobranca } from "@/lib/remetentes";
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
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao } from "@/server/twilio/fabrica";
import { enfileirarWhatsappDoPasso, processarFilaWhatsapp } from "@/server/services/whatsapp-fila";

const ABERTAS = ["PENDING", "OVERDUE"];

export type ResultadoRegua = {
  enviados: number;
  ignorados: number;
  falhas: number;
  whatsappEnfileirados: number;
  whatsappIgnorados: number;
  whatsappEnviados: number;
  whatsappFalhas: number;
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
  opcoes: { agora?: Date; empresaId?: string; resend?: ClienteResend; twilio?: ClienteTwilio } = {},
): Promise<ResultadoRegua> {
  const agora = opcoes.agora ?? new Date();
  const hoje = dataSaoPaulo(agora);
  const hora = horaSaoPaulo(agora);
  const dia = diaSemanaIso(hoje);
  const resend = opcoes.resend ?? clienteResendPadrao();
  const twilio = opcoes.twilio ?? clienteTwilioPadrao();
  const resultado: ResultadoRegua = {
    enviados: 0,
    ignorados: 0,
    falhas: 0,
    whatsappEnfileirados: 0,
    whatsappIgnorados: 0,
    whatsappEnviados: 0,
    whatsappFalhas: 0,
  };

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
    const remetente = emailDeCobranca(config.remetenteEmail);
    const remetentePronto = Boolean(segredo.chave && remetente);
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
        if (passo.canal !== "EMAIL" && !passo.enviarWhatsapp) continue;
        const alvo = passo.naEmissao ? emissao : somarDias(vencimento, passo.dias ?? 0);
        if (!passoCombina(hoje, alvo, regua.enviarFimDeSemana)) continue;

        const rotulo = rotuloPasso(passo);
        if (cliente.status === "BLOQUEADO" || cliente.reguaPausada) {
          const motivo = cliente.status === "BLOQUEADO" ? "cliente bloqueado" : "régua pausada";
          if (passo.canal === "EMAIL") {
            if (await registrarIgnorado({
              empresaId: config.empresaId,
              faturaId: fatura.id,
              clienteId: cliente.id,
              passoId: passo.id,
              modoTeste: config.modoTeste,
              rotulo,
              motivo,
            })) resultado.ignorados += 1;
          }
          if (passo.enviarWhatsapp) {
            const fila = await enfileirarWhatsappDoPasso(fatura, passo, config.modoTeste, agora);
            if (fila === "ignorado") resultado.whatsappIgnorados += 1;
          }
          continue;
        }

        const emailCliente = cliente.email.trim();
        const emailPronto = passo.canal === "EMAIL" && (config.modoTeste ? Boolean(dono?.email) : Boolean(emailCliente)) && remetentePronto && Boolean(segredo.chave);
        if (passo.canal === "EMAIL" && !config.modoTeste && !emailCliente) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: false,
            rotulo,
            motivo: "cliente sem e-mail",
          })) resultado.ignorados += 1;
        } else if (passo.canal === "EMAIL" && config.modoTeste && !dono?.email) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: true,
            rotulo,
            motivo: "modo teste sem dono",
          })) resultado.ignorados += 1;
        } else if (passo.canal === "EMAIL" && (!remetentePronto || !segredo.chave)) {
          if (await registrarIgnorado({
            empresaId: config.empresaId,
            faturaId: fatura.id,
            clienteId: cliente.id,
            passoId: passo.id,
            modoTeste: config.modoTeste,
            rotulo,
            motivo: segredo.motivo ?? "remetente não configurado",
          })) resultado.ignorados += 1;
        } else if (emailPronto && segredo.chave) {
          const campos = {
            cliente: cliente.nomeFantasia,
            servico: fatura.clienteServico?.servico.nome ?? fatura.descricao ?? "cobrança",
            valor: formatarReais(fatura.valor.toFixed(2)),
            vencimento: formatarDataIso(vencimento),
            link: fatura.boletoUrl ?? fatura.faturaUrl ?? "",
            diasAtraso: String(diasAtraso(hoje, vencimento)),
            empresa: nomeEmpresa,
          };
          const corpo = textoRegua(passo.corpo, campos);
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
            assunto: assuntoRegua(textoRegua(passo.assunto, campos), config.modoTeste),
            texto,
            de: remetenteResend(config.remetenteNome ?? "", remetente),
            replyTo: config.replyTo,
            chave: segredo.chave,
            resend,
          });
          if (!envio.repetido) {
            if (envio.lembrete.status === "ENVIADO") resultado.enviados += 1;
            else resultado.falhas += 1;
          }
        }

        if (passo.enviarWhatsapp) {
          const fila = await enfileirarWhatsappDoPasso(fatura, passo, config.modoTeste, agora);
          if (fila === "enfileirado") resultado.whatsappEnfileirados += 1;
          if (fila === "ignorado") resultado.whatsappIgnorados += 1;
        }
      }
    }
  }

  const fila = await processarFilaWhatsapp({ agora, empresaId: opcoes.empresaId, twilio });
  resultado.whatsappEnviados = fila.enviados;
  resultado.whatsappFalhas = fila.falhas;
  resultado.whatsappIgnorados += fila.ignorados;

  return resultado;
}
