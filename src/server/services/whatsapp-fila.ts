import { isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import {
  digitosWhatsapp,
  rotuloTemplateWhatsapp,
  tipoTemplateDoPasso,
  variaveisDoTemplate,
  whatsappE164,
  type TipoTemplateWhatsapp,
} from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import { ErroTwilio } from "@/server/twilio/contrato";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { numeroTesteWhatsapp } from "@/server/twilio/fabrica";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";

const ESPERA_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const TENTATIVAS_MAX = 3;

type StatusFila = "PENDENTE" | "PROCESSANDO" | "ENVIADO" | "FALHOU" | "IGNORADO";

type LinhaCliente = {
  id: string;
  nomeFantasia: string;
  whatsapp: string;
  status: string;
  reguaModo: string;
  reguaPausada: boolean;
};

type LinhaFatura = {
  id: string;
  empresaId: string;
  valor: { toFixed(casas: number): string };
  vencimento: Date;
  boletoUrl: string | null;
  faturaUrl: string | null;
  excluida: boolean;
  cliente: LinhaCliente;
};

type DadosFila = {
  empresaId: string;
  faturaId: string;
  clienteId: string;
  passoId: string | null;
  tipo: TipoTemplateWhatsapp;
  chaveIdempotencia: string;
  status: StatusFila;
  destino: string | null;
  motivo: string | null;
  modoTeste: boolean;
  rotulo: string;
  variaveis: string;
  disponivelEm: Date;
};

type AcessoFila = {
  filaWhatsapp: {
    create(args: { data: DadosFila }): Promise<unknown>;
  };
  configuracaoTwilio: {
    findUnique(args: { where: { empresaId: string } }): Promise<{ senderStatus: string } | null>;
  };
  optOutWhatsapp: {
    findUnique(args: {
      where: { empresaId_telefone: { empresaId: string; telefone: string } };
    }): Promise<{ ativo: boolean } | null>;
  };
};

export type ResultadoFila = "enfileirado" | "ignorado" | "existente" | "nao_aplica";

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

function chaveDe(empresaId: string, faturaId: string, passoId: string | null, tipo: string) {
  return `wa:${empresaId}:${faturaId}:${passoId ?? "pago"}:${tipo}`;
}

async function gravar(db: AcessoFila, dados: DadosFila): Promise<ResultadoFila> {
  try {
    await db.filaWhatsapp.create({ data: dados });
    return dados.status === "IGNORADO" ? "ignorado" : "enfileirado";
  } catch (erro) {
    if (conflito(erro)) return "existente";
    throw erro;
  }
}

async function destinoEMotivo(
  db: AcessoFila,
  empresaId: string,
  cliente: LinhaCliente,
  modoTeste: boolean,
): Promise<{ destino: string | null; motivo: string | null; optOut: boolean }> {
  if (cliente.status === "BLOQUEADO") return { destino: null, motivo: "cliente bloqueado", optOut: false };
  if (cliente.reguaPausada) return { destino: null, motivo: "régua pausada", optOut: false };
  if (cliente.reguaModo === "NENHUMA") return { destino: null, motivo: "sem régua", optOut: false };
  const digitos = digitosWhatsapp(cliente.whatsapp);
  if (digitos) {
    const opt = await db.optOutWhatsapp.findUnique({
      where: { empresaId_telefone: { empresaId, telefone: digitos } },
    });
    if (opt?.ativo) return { destino: null, motivo: "opt-out", optOut: true };
  }
  if (modoTeste) {
    const teste = whatsappE164(numeroTesteWhatsapp() ?? "");
    if (!teste) return { destino: null, motivo: "modo teste sem número de teste", optOut: false };
    return { destino: `whatsapp:${teste}`, motivo: null, optOut: false };
  }
  const clienteE164 = whatsappE164(cliente.whatsapp);
  if (!clienteE164) return { destino: null, motivo: "cliente sem WhatsApp", optOut: false };
  return { destino: `whatsapp:${clienteE164}`, motivo: null, optOut: false };
}

async function montar(
  db: AcessoFila,
  fatura: LinhaFatura,
  tipo: TipoTemplateWhatsapp,
  passoId: string | null,
  dias: number | null,
  modoTeste: boolean,
  agora: Date,
): Promise<DadosFila> {
  const conexao = await db.configuracaoTwilio.findUnique({ where: { empresaId: fatura.empresaId } });
  const base = {
    empresaId: fatura.empresaId,
    faturaId: fatura.id,
    clienteId: fatura.cliente.id,
    passoId,
    tipo,
    chaveIdempotencia: chaveDe(fatura.empresaId, fatura.id, passoId, tipo),
    modoTeste,
    rotulo: rotuloTemplateWhatsapp(tipo, dias),
    disponivelEm: agora,
  };
  if (!conexao) {
    return { ...base, status: "IGNORADO", destino: null, motivo: "WhatsApp não conectado", variaveis: "{}" };
  }
  if (conexao.senderStatus !== "ONLINE") {
    return { ...base, status: "IGNORADO", destino: null, motivo: "sender ainda não está online", variaveis: "{}" };
  }
  const regra = await destinoEMotivo(db, fatura.empresaId, fatura.cliente, modoTeste);
  const variaveis = variaveisDoTemplate(tipo, {
    nome: fatura.cliente.nomeFantasia,
    valor: formatarReais(fatura.valor.toFixed(2)),
    vencimento: formatarDataIso(isoDeData(fatura.vencimento)),
    link: fatura.boletoUrl ?? fatura.faturaUrl ?? "",
    dias: String(Math.abs(dias ?? 0)),
  });
  if (regra.motivo) {
    return { ...base, status: "IGNORADO", destino: null, motivo: regra.motivo, variaveis: "{}" };
  }
  if (!variaveis) {
    return { ...base, status: "IGNORADO", destino: null, motivo: "cobrança sem link do Asaas", variaveis: "{}" };
  }
  return {
    ...base,
    status: "PENDENTE",
    destino: regra.destino,
    motivo: null,
    variaveis: JSON.stringify(variaveis),
  };
}

export async function enfileirarWhatsappDoPasso(
  fatura: LinhaFatura,
  passo: { id: string; naEmissao: boolean; dias: number | null; enviarWhatsapp: boolean },
  modoTeste: boolean,
  agora = new Date(),
  db: AcessoFila = prisma,
): Promise<ResultadoFila> {
  if (!passo.enviarWhatsapp || fatura.excluida) return "nao_aplica";
  const tipo = tipoTemplateDoPasso(passo);
  return gravar(db, await montar(db, fatura, tipo, passo.id, passo.dias, modoTeste, agora));
}

const PAGOS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_DUNNING_RECEIVED"]);
const STATUS_PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);

export function eventoConfirmaPagamento(tipo: string, pagamento: Record<string, unknown> | null): boolean {
  if (PAGOS.has(tipo)) return true;
  const status = typeof pagamento?.status === "string" ? pagamento.status.toUpperCase() : "";
  return STATUS_PAGO.has(status) && tipo.startsWith("PAYMENT_");
}

export async function enfileirarPagoWhatsapp(
  db: AcessoFila,
  fatura: LinhaFatura,
  modoTeste: boolean,
  agora = new Date(),
): Promise<ResultadoFila> {
  if (fatura.excluida) return "nao_aplica";
  return gravar(db, await montar(db, fatura, "PAGO", null, null, modoTeste, agora));
}

function variaveisGravadas(texto: string): Record<string, string> | null {
  try {
    const json = JSON.parse(texto) as unknown;
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const saida: Record<string, string> = {};
    for (const [chave, valor] of Object.entries(json)) {
      if (typeof valor !== "string" || !/^[1-5]$/.test(chave)) return null;
      saida[chave] = valor;
    }
    return saida;
  } catch {
    return null;
  }
}

async function marcar(
  id: string,
  data: { status: StatusFila; motivo?: string | null; destino?: string | null; messageSid?: string; disponivelEm?: Date },
) {
  await prisma.filaWhatsapp.update({ where: { id }, data });
}

export async function processarFilaWhatsapp(
  opcoes: { agora?: Date; empresaId?: string; twilio?: ClienteTwilio; limite?: number } = {},
): Promise<{ enviados: number; falhas: number; ignorados: number }> {
  const agora = opcoes.agora ?? new Date();
  const twilio = opcoes.twilio;
  if (!twilio) return { enviados: 0, falhas: 0, ignorados: 0 };
  const filtroEmpresa = opcoes.empresaId ? { empresaId: opcoes.empresaId } : {};
  const resultado = { enviados: 0, falhas: 0, ignorados: 0 };
  const travado = new Date(agora.getTime() - 10 * 60 * 1000);
  await prisma.filaWhatsapp.updateMany({
    where: { ...filtroEmpresa, status: "PROCESSANDO", messageSid: null, atualizadoEm: { lt: travado } },
    data: { status: "PENDENTE" },
  });

  const pendentes = await prisma.filaWhatsapp.findMany({
    where: { ...filtroEmpresa, status: "PENDENTE", disponivelEm: { lte: agora } },
    orderBy: { criadoEm: "asc" },
    take: opcoes.limite ?? 20,
    include: { cliente: true, fatura: true },
  });

  for (const item of pendentes) {
    const reivindicado = await prisma.filaWhatsapp.updateMany({
      where: { id: item.id, status: "PENDENTE" },
      data: { status: "PROCESSANDO" },
    });
    if (reivindicado.count !== 1) continue;

    const [conexao, regua, template] = await Promise.all([
      prisma.configuracaoTwilio.findUnique({ where: { empresaId: item.empresaId } }),
      prisma.configuracaoRegua.findUnique({ where: { empresaId: item.empresaId } }),
      prisma.templateWhatsapp.findUnique({
        where: { empresaId_tipo: { empresaId: item.empresaId, tipo: item.tipo } },
      }),
    ]);
    const modoTeste = regua?.modoTeste ?? item.modoTeste;
    const regra = await destinoEMotivo(prisma, item.empresaId, item.cliente, modoTeste);
    if (regra.motivo || !regra.destino) {
      await marcar(item.id, { status: "IGNORADO", motivo: regra.motivo ?? "sem destino", destino: null });
      resultado.ignorados += 1;
      continue;
    }
    const clienteE164 = whatsappE164(item.cliente.whatsapp);
    if (modoTeste && clienteE164 && regra.destino === `whatsapp:${clienteE164}`) {
      const teste = whatsappE164(numeroTesteWhatsapp() ?? "");
      if (!teste || teste !== clienteE164) {
        await marcar(item.id, { status: "IGNORADO", motivo: "modo teste não envia para o cliente", destino: null });
        resultado.ignorados += 1;
        continue;
      }
    }
    if (!conexao || conexao.senderStatus !== "ONLINE" || !conexao.senderTelefone || !template || !template.contentSid || template.status !== "APROVADO") {
      const venceuPrazo = agora.getTime() - item.criadoEm.getTime() > ESPERA_MAX_MS;
      if (venceuPrazo) {
        await marcar(item.id, { status: "IGNORADO", motivo: "template ou sender não ficou pronto a tempo" });
        resultado.ignorados += 1;
      } else {
        await marcar(item.id, {
          status: "PENDENTE",
          motivo: "template aguardando aprovação",
          disponivelEm: new Date(agora.getTime() + 60 * 60 * 1000),
        });
      }
      continue;
    }
    const variaveis = variaveisGravadas(item.variaveis);
    if (!variaveis) {
      await marcar(item.id, { status: "FALHOU", motivo: "variáveis inválidas" });
      resultado.falhas += 1;
      continue;
    }
    let token = "";
    try {
      token = decifrarSegredoAsaas(conexao.authTokenCifrado);
    } catch {
      await marcar(item.id, { status: "FALHOU", motivo: "token ilegível" });
      resultado.falhas += 1;
      continue;
    }
    try {
      const envio = await twilio.enviarMensagem(
        { accountSid: conexao.subaccountSid, authToken: token },
        {
          de: `whatsapp:${whatsappE164(conexao.senderTelefone) ?? conexao.senderTelefone}`,
          para: regra.destino,
          contentSid: template.contentSid,
          variaveis,
          statusCallback: conexao.webhookUrl,
        },
      );
      await marcar(item.id, { status: "ENVIADO", messageSid: envio.sid, destino: regra.destino, motivo: null });
      resultado.enviados += 1;
    } catch (erro) {
      const tentativas = item.tentativas + 1;
      const motivo = (erro instanceof ErroTwilio ? erro.message : "Falha ao enviar WhatsApp.").slice(0, 180);
      if (tentativas >= TENTATIVAS_MAX) {
        await prisma.filaWhatsapp.update({
          where: { id: item.id },
          data: { status: "FALHOU", tentativas, motivo },
        });
        resultado.falhas += 1;
      } else {
        await prisma.filaWhatsapp.update({
          where: { id: item.id },
          data: {
            status: "PENDENTE",
            tentativas,
            motivo,
            disponivelEm: new Date(agora.getTime() + 15 * 60 * 1000),
          },
        });
      }
    }
  }

  return resultado;
}
