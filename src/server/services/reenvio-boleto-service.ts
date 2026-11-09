import { dataSaoPaulo } from "@/lib/regua";
import {
  JANELA_REENVIO_BOLETOS_MS,
  TETO_REENVIO_BOLETOS_JANELA,
  motivoForaDaSelecaoBoleto,
} from "@/lib/reenvio-boleto";
import type { ItemReenvioBoleto, ResultadoReenvioBoletos, SituacaoReenvioBoleto } from "@/lib/tipos";
import { esquemaReenvioBoletos } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { clienteResendPadrao, type ClienteResend } from "@/server/regua/resend";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao } from "@/server/twilio/fabrica";
import { lerEsquema } from "@/server/validar";
import { faturaIdsComPromessaAtiva } from "./promessa-service";
import { enviarLembreteAgora } from "./regua-service";
import { enfileirarWhatsappDoPasso, processarFilaWhatsapp, type ResultadoFila } from "./whatsapp-fila";

type AutorReenvio = AutorEmpresa & { email: string; nomeEmpresa: string };

type PassoEmissao = {
  id: string;
  naEmissao: boolean;
  dias: number | null;
  canal: string;
  enviarWhatsapp: boolean;
  ordem: number;
};

type ReguaComPassos = {
  id: string;
  padrao: boolean;
  passos: PassoEmissao[];
};

const MOTIVO_NAO_ENCONTRADA = "Não encontrada";

function semEnvio(id: string, nomeCliente: string | null, motivo: string): ItemReenvioBoleto {
  return {
    id,
    nomeCliente,
    email: "ignorado",
    emailMotivo: motivo,
    whatsapp: "ignorado",
    whatsappMotivo: motivo,
  };
}

function reguaDoCliente(
  cliente: { reguaModo: string; reguaId: string | null },
  reguas: ReguaComPassos[],
): { regua: ReguaComPassos | null; motivo: string | null } {
  if (cliente.reguaModo === "NENHUMA") return { regua: null, motivo: "Sem régua" };
  if (cliente.reguaModo === "ESPECIFICA") {
    const regua = reguas.find((item) => item.id === cliente.reguaId) ?? null;
    return regua ? { regua, motivo: null } : { regua: null, motivo: "Sem régua" };
  }
  const padrao = reguas.find((item) => item.padrao) ?? null;
  return padrao ? { regua: padrao, motivo: null } : { regua: null, motivo: "Sem régua padrão" };
}

function passoEmissao(regua: ReguaComPassos): PassoEmissao | null {
  return [...regua.passos].sort((a, b) => a.ordem - b.ordem).find((passo) => passo.naEmissao) ?? null;
}

function resultadoEmail(erro: unknown): { email: SituacaoReenvioBoleto; emailMotivo: string } {
  if (erro instanceof ErroAplicacao) {
    return {
      email: erro.status >= 500 ? "falhou" : "ignorado",
      emailMotivo: erro.message.slice(0, 180),
    };
  }
  return { email: "falhou", emailMotivo: "Não foi possível enviar o e-mail." };
}

function resultadoWhatsapp(
  enfileirou: ResultadoFila,
  linha: { status: string; motivo: string | null } | null,
): { whatsapp: SituacaoReenvioBoleto; whatsappMotivo: string | null } {
  if (enfileirou === "nao_aplica") {
    return { whatsapp: "nao_aplica", whatsappMotivo: "WhatsApp oficial não envia esta cobrança" };
  }
  if (!linha) return { whatsapp: "ignorado", whatsappMotivo: "WhatsApp não entrou na fila" };
  if (linha.status === "ENVIADO") {
    return enfileirou === "existente"
      ? { whatsapp: "ja_existia", whatsappMotivo: "Já aceito antes. Não enviamos de novo." }
      : { whatsapp: "aceito", whatsappMotivo: null };
  }
  if (linha.status === "FALHOU") {
    return { whatsapp: "falhou", whatsappMotivo: (linha.motivo ?? "Falha no WhatsApp").slice(0, 180) };
  }
  if (linha.status === "IGNORADO") {
    return { whatsapp: "ignorado", whatsappMotivo: (linha.motivo ?? "WhatsApp ignorado").slice(0, 180) };
  }
  return { whatsapp: "na_fila", whatsappMotivo: (linha.motivo ?? "Na fila. Ainda não foi aceito.").slice(0, 180) };
}

export async function reenviarBoletos(
  autor: AutorReenvio,
  entrada: unknown,
  opcoes: { resend?: ClienteResend; twilio?: ClienteTwilio; agora?: Date } = {},
): Promise<ResultadoReenvioBoletos> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaReenvioBoletos, entrada);
  const agora = opcoes.agora ?? new Date();
  const resend = opcoes.resend ?? clienteResendPadrao();
  const twilio = opcoes.twilio ?? clienteTwilioPadrao();
  const vistos = new Set<string>();
  const ids: string[] = [];
  for (const id of dados.ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }

  const desde = new Date(agora.getTime() - JANELA_REENVIO_BOLETOS_MS);
  const recentes = await prisma.lembreteRegua.count({
    where: {
      empresaId: autor.empresaId,
      automatico: false,
      rotulo: "Na emissão",
      criadoEm: { gte: desde },
    },
  });
  if (recentes >= TETO_REENVIO_BOLETOS_JANELA) {
    throw new ErroAplicacao(
      "Muitos reenvios agora. Espere alguns minutos e tente de novo.",
      429,
      "limite_reenvio",
    );
  }

  const [faturas, reguas, config, promessas] = await Promise.all([
    prisma.fatura.findMany({
      where: { empresaId: autor.empresaId, id: { in: ids } },
      include: { cliente: true },
    }),
    prisma.reguaCobranca.findMany({
      where: { empresaId: autor.empresaId },
      include: { passos: true },
    }),
    prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } }),
    faturaIdsComPromessaAtiva(autor.empresaId, dataSaoPaulo(agora)),
  ]);
  const porId = new Map(faturas.map((fatura) => [fatura.id, fatura]));
  const modoTeste = config?.modoTeste ?? true;
  const itens: ItemReenvioBoleto[] = [];
  const whatsapps: { indice: number; enfileirou: ResultadoFila }[] = [];

  for (const id of ids) {
    const fatura = porId.get(id);
    if (!fatura) {
      itens.push(semEnvio(id, null, MOTIVO_NAO_ENCONTRADA));
      continue;
    }
    const nome = fatura.cliente.nomeFantasia;
    const fora = motivoForaDaSelecaoBoleto(fatura);
    if (fora) {
      itens.push(semEnvio(id, nome, fora));
      continue;
    }
    if (fatura.cliente.status === "BLOQUEADO") {
      itens.push(semEnvio(id, nome, "Cliente bloqueado"));
      continue;
    }
    if (fatura.cliente.reguaPausada) {
      itens.push(semEnvio(id, nome, "Régua pausada"));
      continue;
    }
    if (promessas.has(fatura.id)) {
      itens.push(semEnvio(id, nome, "Promessa de pagamento"));
      continue;
    }
    const atribuicao = reguaDoCliente(fatura.cliente, reguas);
    if (!atribuicao.regua || atribuicao.motivo) {
      itens.push(semEnvio(id, nome, atribuicao.motivo ?? "Sem régua"));
      continue;
    }
    const passo = passoEmissao(atribuicao.regua);
    if (!passo) {
      itens.push(semEnvio(id, nome, "Sem aviso de emissão"));
      continue;
    }
    if (!config) {
      itens.push(semEnvio(id, nome, "Régua não configurada"));
      continue;
    }

    let email: SituacaoReenvioBoleto = "ignorado";
    let emailMotivo: string | null = null;
    if (!config.chaveResendCifrada) {
      emailMotivo = "Régua sem remetente";
    } else if (!modoTeste && !fatura.cliente.email.trim()) {
      emailMotivo = "Cliente sem e-mail";
    } else if (passo.canal === "EMAIL") {
      try {
        await enviarLembreteAgora(autor, fatura.id, { passoId: passo.id }, { resend, agora });
        email = "aceito";
        emailMotivo = null;
      } catch (erro) {
        const falha = resultadoEmail(erro);
        email = falha.email;
        emailMotivo = falha.emailMotivo;
      }
    } else {
      emailMotivo = "Passo sem e-mail";
    }

    const indice = itens.length;
    itens.push({
      id,
      nomeCliente: nome,
      email,
      emailMotivo,
      whatsapp: "nao_aplica",
      whatsappMotivo: null,
    });

    if (!passo.enviarWhatsapp) {
      itens[indice] = { ...itens[indice], whatsapp: "nao_aplica", whatsappMotivo: "Passo sem WhatsApp" };
      continue;
    }

    // Mesma fila da emissão. A chave única não deixa o mesmo boleto entrar duas vezes.
    const enfileirou = await enfileirarWhatsappDoPasso(fatura, passo, modoTeste, agora);
    whatsapps.push({ indice, enfileirou });
  }

  if (whatsapps.length > 0) {
    await processarFilaWhatsapp({
      agora,
      empresaId: autor.empresaId,
      twilio,
      tipos: ["BOLETO_GERADO"],
      faturaIds: whatsapps.map((item) => itens[item.indice].id),
      limite: whatsapps.length,
      conciliar: false,
    });
    const linhas = await prisma.filaWhatsapp.findMany({
      where: {
        empresaId: autor.empresaId,
        tipo: "BOLETO_GERADO",
        faturaId: { in: whatsapps.map((item) => itens[item.indice].id) },
      },
      orderBy: { criadoEm: "desc" },
    });
    for (const item of whatsapps) {
      const faturaId = itens[item.indice].id;
      const linha = linhas.find((candidata) => candidata.faturaId === faturaId) ?? null;
      const whatsapp = resultadoWhatsapp(item.enfileirou, linha);
      itens[item.indice] = { ...itens[item.indice], ...whatsapp };
    }
  }

  return { modoTeste, itens };
}
