import { dataHojeIso, isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import {
  decidirEnvioSms,
  digitosTelefoneCobranca,
  montarMensagemSms,
  numeroTesteSms,
  prefixoModoTesteSms,
  remetenteSms,
  rotuloSms,
  smsHabilitado,
  telefoneClienteE164,
} from "@/lib/sms-cobranca";
import { tipoTemplateDoPasso, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import { ErroTwilio, type ClienteTwilio, type CredencialTwilio } from "@/server/twilio/contrato";
import { credenciaisPaiTwilio, urlWebhookTwilio } from "@/server/twilio/fabrica";
import { enviarSmsAutorizado } from "@/server/sms/envio";

const TENTATIVAS_MAX = 3;

type StatusFila = "PENDENTE" | "PROCESSANDO" | "ENVIADO" | "FALHOU" | "IGNORADO";

type LinhaCliente = {
  id: string;
  nomeFantasia: string;
  whatsapp: string;
  status: string;
  reguaModo: string;
  reguaPausada: boolean;
  reguaId?: string | null;
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
  corpo: string;
  disponivelEm: Date;
};

type AcessoFila = {
  filaSms: {
    create(args: { data: DadosFila }): Promise<unknown>;
  };
  optOutWhatsapp: {
    findUnique(args: {
      where: { empresaId_telefone: { empresaId: string; telefone: string } };
    }): Promise<{ ativo: boolean } | null>;
  };
};

export type ResultadoFilaSms = "enfileirado" | "ignorado" | "existente" | "nao_aplica";

function conflito(erro: unknown) {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

function chaveDe(empresaId: string, faturaId: string, passoId: string | null, tipo: string) {
  return `sms:${empresaId}:${faturaId}:${passoId ?? "pago"}:${tipo}`;
}

async function gravar(db: AcessoFila, dados: DadosFila): Promise<ResultadoFilaSms> {
  try {
    await db.filaSms.create({ data: dados });
    return dados.status === "IGNORADO" ? "ignorado" : "enfileirado";
  } catch (erro) {
    if (conflito(erro)) return "existente";
    throw erro;
  }
}

async function optOutAtivo(db: AcessoFila, empresaId: string, telefone: string | null) {
  const digitos = telefone ? digitosTelefoneCobranca(telefone) : null;
  if (!digitos) return false;
  const opt = await db.optOutWhatsapp.findUnique({
    where: { empresaId_telefone: { empresaId, telefone: digitos } },
  });
  return Boolean(opt?.ativo);
}

async function montar(
  db: AcessoFila,
  fatura: LinhaFatura,
  tipo: TipoTemplateWhatsapp,
  passoId: string | null,
  dias: number | null,
  modoTeste: boolean,
  nomeEmpresa: string,
  agora: Date,
): Promise<DadosFila> {
  const base = {
    empresaId: fatura.empresaId,
    faturaId: fatura.id,
    clienteId: fatura.cliente.id,
    passoId,
    tipo,
    chaveIdempotencia: chaveDe(fatura.empresaId, fatura.id, passoId, tipo),
    modoTeste,
    rotulo: rotuloSms(tipo, dias),
    disponivelEm: agora,
  };
  const vazio = (motivo: string): DadosFila => ({ ...base, status: "IGNORADO", destino: null, motivo, corpo: "" });
  if (!smsHabilitado()) return vazio("SMS desligado");
  if (fatura.cliente.status === "BLOQUEADO") return vazio("cliente bloqueado");
  if (fatura.cliente.reguaPausada) return vazio("régua pausada");
  if (fatura.cliente.reguaModo === "NENHUMA") return vazio("sem régua");
  const telefoneCliente = telefoneClienteE164(fatura.cliente.whatsapp);
  if (!telefoneCliente) return vazio("cliente sem telefone");
  if (await optOutAtivo(db, fatura.empresaId, telefoneCliente)) return vazio("opt-out");
  const teste = numeroTesteSms();
  if (teste && await optOutAtivo(db, fatura.empresaId, teste)) return vazio("opt-out");
  const corpo = montarMensagemSms(tipo, {
    empresa: nomeEmpresa,
    nome: fatura.cliente.nomeFantasia,
    valor: formatarReais(fatura.valor.toFixed(2)),
    vencimento: formatarDataIso(isoDeData(fatura.vencimento)),
    link: fatura.boletoUrl ?? fatura.faturaUrl ?? "",
    dias: String(Math.abs(dias ?? 0)),
  });
  if (!corpo) return vazio("mensagem inválida");
  const decisao = decidirEnvioSms({
    habilitado: true,
    modoTeste,
    remetente: remetenteSms(),
    teste,
    telefoneCliente,
    destinoPedido: teste,
  });
  if (!decisao.enviar) return vazio(decisao.motivo);
  return {
    ...base,
    status: "PENDENTE",
    destino: decisao.para,
    motivo: null,
    corpo,
  };
}

export async function enfileirarSmsDoPasso(
  fatura: LinhaFatura,
  passo: { id: string; naEmissao: boolean; dias: number | null; enviarSms: boolean },
  modoTeste: boolean,
  nomeEmpresa: string,
  agora = new Date(),
  db: AcessoFila = prisma,
): Promise<ResultadoFilaSms> {
  if (!passo.enviarSms || fatura.excluida || !smsHabilitado()) return "nao_aplica";
  const tipo = tipoTemplateDoPasso(passo);
  return gravar(db, await montar(db, fatura, tipo, passo.id, passo.dias, modoTeste, nomeEmpresa, agora));
}

type AcessoPago = AcessoFila & {
  empresa: { findUnique(args: { where: { id: string }; select: { nomeFantasia: true } }): Promise<{ nomeFantasia: string } | null> };
  reguaCobranca: { findFirst(args: { where: { empresaId: string; padrao?: boolean; id?: string }; select: { id: true } }): Promise<{ id: string } | null> };
  passoRegua: { count(args: { where: { empresaId: string; reguaId: string; enviarSms: boolean } }): Promise<number> };
};

async function reguaMarcouSms(db: AcessoPago, fatura: LinhaFatura) {
  const cliente = fatura.cliente;
  if (cliente.reguaModo === "NENHUMA") return false;
  let reguaId = cliente.reguaModo === "ESPECIFICA" ? cliente.reguaId ?? null : null;
  if (!reguaId) {
    const padrao = await db.reguaCobranca.findFirst({
      where: { empresaId: fatura.empresaId, padrao: true },
      select: { id: true },
    });
    reguaId = padrao?.id ?? null;
  }
  if (!reguaId) return false;
  const marcados = await db.passoRegua.count({
    where: { empresaId: fatura.empresaId, reguaId, enviarSms: true },
  });
  return marcados > 0;
}

export async function enfileirarPagoSms(
  db: AcessoPago,
  fatura: LinhaFatura,
  modoTeste: boolean,
  agora = new Date(),
): Promise<ResultadoFilaSms> {
  if (fatura.excluida || !smsHabilitado()) return "nao_aplica";
  if (!(await reguaMarcouSms(db, fatura))) return "nao_aplica";
  const empresa = await db.empresa.findUnique({
    where: { id: fatura.empresaId },
    select: { nomeFantasia: true },
  });
  return gravar(db, await montar(db, fatura, "PAGO", null, null, modoTeste, empresa?.nomeFantasia ?? "", agora));
}

async function marcar(
  id: string,
  empresaId: string,
  data: { status: StatusFila; motivo?: string | null; destino?: string | null; messageSid?: string; disponivelEm?: Date },
) {
  await prisma.filaSms.updateMany({ where: { id, empresaId }, data });
}

export async function processarFilaSms(
  opcoes: { agora?: Date; empresaId?: string; twilio?: ClienteTwilio; limite?: number } = {},
): Promise<{ enviados: number; falhas: number; ignorados: number }> {
  const agora = opcoes.agora ?? new Date();
  const twilio = opcoes.twilio;
  if (!twilio) return { enviados: 0, falhas: 0, ignorados: 0 };
  const filtroEmpresa = opcoes.empresaId ? { empresaId: opcoes.empresaId } : {};
  const resultado = { enviados: 0, falhas: 0, ignorados: 0 };
  const travado = new Date(agora.getTime() - 10 * 60 * 1000);
  await prisma.filaSms.updateMany({
    where: { ...filtroEmpresa, status: "PROCESSANDO", messageSid: null, atualizadoEm: { lt: travado } },
    data: { status: "PENDENTE" },
  });

  const pendentes = await prisma.filaSms.findMany({
    where: { ...filtroEmpresa, status: "PENDENTE", disponivelEm: { lte: agora } },
    orderBy: { criadoEm: "asc" },
    take: opcoes.limite ?? 20,
    include: { cliente: true, fatura: true },
  });

  for (const item of pendentes) {
    const reivindicado = await prisma.filaSms.updateMany({
      where: { id: item.id, empresaId: item.empresaId, status: "PENDENTE" },
      data: { status: "PROCESSANDO" },
    });
    if (reivindicado.count !== 1) continue;

    const [regua, optCliente, optTeste] = await Promise.all([
      prisma.configuracaoRegua.findUnique({ where: { empresaId: item.empresaId } }),
      prisma.optOutWhatsapp.findUnique({
        where: {
          empresaId_telefone: {
            empresaId: item.empresaId,
            telefone: digitosTelefoneCobranca(item.cliente.whatsapp) ?? "",
          },
        },
      }),
      prisma.optOutWhatsapp.findUnique({
        where: {
          empresaId_telefone: {
            empresaId: item.empresaId,
            telefone: digitosTelefoneCobranca(numeroTesteSms() ?? "") ?? "",
          },
        },
      }),
    ]);
    if (optCliente?.ativo || optTeste?.ativo) {
      await marcar(item.id, item.empresaId, { status: "IGNORADO", motivo: "opt-out", destino: null });
      resultado.ignorados += 1;
      continue;
    }
    if (item.cliente.status === "BLOQUEADO" || item.cliente.reguaPausada || item.cliente.reguaModo === "NENHUMA") {
      const motivo = item.cliente.status === "BLOQUEADO"
        ? "cliente bloqueado"
        : item.cliente.reguaPausada
          ? "régua pausada"
          : "sem régua";
      await marcar(item.id, item.empresaId, { status: "IGNORADO", motivo, destino: null });
      resultado.ignorados += 1;
      continue;
    }

    if (item.tipo !== "PAGO") {
      const hoje = dataHojeIso(agora);
      const promessa = await prisma.promessaPagamento.findFirst({
        where: {
          empresaId: item.empresaId,
          faturaId: item.faturaId,
          status: "PENDENTE",
          dataPrometida: { gte: new Date(`${hoje}T00:00:00.000Z`) },
        },
        select: { id: true },
      });
      if (promessa) {
        await marcar(item.id, item.empresaId, { status: "IGNORADO", motivo: "promessa de pagamento", destino: null });
        resultado.ignorados += 1;
        continue;
      }
    }

    const modoTeste = regua?.modoTeste ?? false;
    const teste = numeroTesteSms();
    const telefoneCliente = telefoneClienteE164(item.cliente.whatsapp);
    const decisao = decidirEnvioSms({
      habilitado: smsHabilitado(),
      modoTeste,
      remetente: remetenteSms(),
      teste,
      telefoneCliente,
      destinoPedido: item.destino,
    });
    if (!decisao.enviar) {
      await marcar(item.id, item.empresaId, { status: "IGNORADO", motivo: decisao.motivo, destino: null });
      resultado.ignorados += 1;
      continue;
    }

    let conta: CredencialTwilio;
    let statusCallback = "";
    try {
      conta = credenciaisPaiTwilio();
      statusCallback = urlWebhookTwilio();
    } catch {
      await marcar(item.id, item.empresaId, { status: "IGNORADO", motivo: "SMS sem credencial ou webhook", destino: null });
      resultado.ignorados += 1;
      continue;
    }

    try {
      const envio = await enviarSmsAutorizado(twilio, conta, {
        decisao,
        teste,
        corpo: prefixoModoTesteSms(item.corpo),
        statusCallback,
      });
      if (!envio.enviado) {
        await marcar(item.id, item.empresaId, { status: "IGNORADO", motivo: envio.motivo, destino: null });
        resultado.ignorados += 1;
        continue;
      }
      await marcar(item.id, item.empresaId, {
        status: "ENVIADO",
        messageSid: envio.sid,
        destino: decisao.para,
        motivo: null,
      });
      resultado.enviados += 1;
    } catch (erro) {
      const tentativas = item.tentativas + 1;
      const motivo = (erro instanceof ErroTwilio ? erro.message : "Falha ao enviar SMS.").slice(0, 180);
      if (tentativas >= TENTATIVAS_MAX) {
        await marcar(item.id, item.empresaId, { status: "FALHOU", motivo });
        resultado.falhas += 1;
      } else {
        await prisma.filaSms.updateMany({
          where: { id: item.id, empresaId: item.empresaId },
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
