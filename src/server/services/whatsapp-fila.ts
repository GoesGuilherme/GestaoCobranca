import { dataHojeIso, isoDeData } from "@/lib/data";
import { absolutizarLinkCobranca } from "@/lib/pix-link";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import {
  digitosWhatsapp,
  rotuloTemplateWhatsapp,
  rotuloWhatsappNaEmissao,
  variaveisCompativeisComTemplate,
  variaveisDoTemplate,
  whatsappE164,
  type TipoTemplateWhatsapp,
} from "@/lib/whatsapp-cobranca";
import { provedorCodigo, statusEh } from "@/lib/status-pagamento";
import { sinalAsaasConfirmaPagamento } from "@/server/pagamentos/webhook-asaas";
import { prisma } from "@/server/db";
import { ErroTwilio } from "@/server/twilio/contrato";
import type { ClienteTwilio, CredencialTwilio, MensagemTemplate } from "@/server/twilio/contrato";
import { credenciaisPaiTwilio, numeroTesteWhatsapp, urlWebhookTwilio } from "@/server/twilio/fabrica";
import { Prisma } from "@/generated/prisma/client";
import { aplicarRemetenteEmpresa, remetenteDaEmpresa, type DbRemetente } from "@/server/twilio/remetente";
import {
  decidirSubcontaWhatsapp,
  registrarFallbackSubconta,
  tipoWhatsappDoPasso,
} from "@/server/twilio/subconta-whatsapp";
import {
  contentSidSandbox,
  inicioWhatsappOficialProducao,
  REMETENTE_OFICIAL_WHATSAPP,
  REMETENTE_SANDBOX_WHATSAPP,
  remetenteOficialLigado,
  rotaWhatsapp,
  usarSandboxWhatsapp,
} from "@/server/twilio/sandbox";
import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { conciliarPromessas } from "@/server/services/promessa-service";

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
  criadoEm: Date;
  formaCobranca: string;
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
} & DbRemetente &
  Pick<Prisma.TransactionClient, "templateWhatsapp">;

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
  const [conexao, remetenteEmpresa] = await Promise.all([
    db.configuracaoTwilio.findUnique({ where: { empresaId: fatura.empresaId } }),
    remetenteDaEmpresa(fatura.empresaId, "WHATSAPP", process.env, db),
  ]);
  const subcontaPronta = Boolean(remetenteEmpresa);
  const rota = rotaWhatsapp({
    modoTeste,
    oficialLigado: remetenteOficialLigado(),
    sandboxLigado: usarSandboxWhatsapp(true),
    empresaPronta: false,
    producaoLiberada: faturaLiberadaOficial(fatura.criadoEm),
  });
  const canalPai = rota === "oficial_teste" || rota === "oficial_producao" || rota === "sandbox";
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
  if (!conexao && !canalPai && !subcontaPronta) {
    return { ...base, status: "IGNORADO", destino: null, motivo: "WhatsApp não conectado", variaveis: "{}" };
  }
  if (conexao && conexao.senderStatus !== "ONLINE" && !canalPai && !subcontaPronta) {
    return { ...base, status: "IGNORADO", destino: null, motivo: "sender ainda não está online", variaveis: "{}" };
  }
  const regra = await destinoEMotivo(db, fatura.empresaId, fatura.cliente, modoTeste);
  const variaveis = variaveisDoTemplate(tipo, {
    nome: fatura.cliente.nomeFantasia,
    valor: formatarReais(fatura.valor.toFixed(2)),
    vencimento: formatarDataIso(isoDeData(fatura.vencimento)),
    link: absolutizarLinkCobranca(fatura.boletoUrl ?? fatura.faturaUrl ?? ""),
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

function faturaLiberadaOficial(criadoEm: Date): boolean {
  const inicio = inicioWhatsappOficialProducao();
  if (!inicio) return false;
  return criadoEm.getTime() >= inicio.getTime();
}

export async function enfileirarWhatsappDoPasso(
  fatura: LinhaFatura,
  passo: { id: string; naEmissao: boolean; dias: number | null; enviarWhatsapp: boolean },
  modoTeste: boolean,
  agora = new Date(),
  db: AcessoFila = prisma,
  chaveSufixo?: string,
): Promise<ResultadoFila> {
  if (!passo.enviarWhatsapp || fatura.excluida) return "nao_aplica";
  const resolvido = await tipoWhatsappDoPasso(fatura.empresaId, passo, fatura, agora, process.env, db);
  if (!resolvido) return "nao_aplica";
  if (!modoTeste && remetenteOficialLigado() && !faturaLiberadaOficial(fatura.criadoEm)) return "nao_aplica";
  const dados = await montar(db, fatura, resolvido.tipo, passo.id, resolvido.dias, modoTeste, agora);
  const sufixo = chaveSufixo?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) ?? "";
  if (sufixo) dados.chaveIdempotencia = `${dados.chaveIdempotencia}:${sufixo}`;
  const rotuloEmissao = passo.naEmissao ? rotuloWhatsappNaEmissao(fatura.formaCobranca, resolvido.tipo) : null;
  if (rotuloEmissao) dados.rotulo = rotuloEmissao;
  return gravar(db, dados);
}

export function eventoConfirmaPagamento(tipo: string, pagamento: Record<string, unknown> | null): boolean {
  return sinalAsaasConfirmaPagamento(tipo, pagamento);
}

export async function enfileirarPagoWhatsapp(
  db: AcessoFila,
  fatura: LinhaFatura,
  modoTeste: boolean,
  agora = new Date(),
): Promise<ResultadoFila> {
  if (fatura.excluida) return "nao_aplica";
  if (!modoTeste && remetenteOficialLigado() && !faturaLiberadaOficial(fatura.criadoEm)) return "nao_aplica";
  return gravar(db, await montar(db, fatura, "PAGO", null, null, modoTeste, agora));
}

function motivoInelegivel(
  tipo: string,
  fatura: { status: string; excluida: boolean; provedor: string },
): string | null {
  if (fatura.excluida) return "fatura excluída";
  const provedor = provedorCodigo(fatura.provedor);
  if (tipo === "PAGO") return statusEh(fatura.status, "PAGO", provedor) ? null : "fatura não está paga";
  if (statusEh(fatura.status, "REGUA_ABERTA", provedor)) return null;
  if (statusEh(fatura.status, "PAGO", provedor)) return "fatura paga";
  return "fatura não está em aberto";
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

async function adiarOuIgnorar(id: string, criadoEm: Date, agora: Date, aguardando: string, esgotado = aguardando) {
  const venceuPrazo = agora.getTime() - criadoEm.getTime() > ESPERA_MAX_MS;
  if (venceuPrazo) {
    await marcar(id, { status: "IGNORADO", motivo: esgotado });
    return "ignorado" as const;
  }
  await marcar(id, {
    status: "PENDENTE",
    motivo: aguardando,
    disponivelEm: new Date(agora.getTime() + 60 * 60 * 1000),
  });
  return "adiado" as const;
}

async function concluirEnvio(
  twilio: ClienteTwilio,
  item: { id: string; tentativas: number },
  agora: Date,
  conta: CredencialTwilio,
  mensagem: MensagemTemplate,
  motivoSucesso: string | null = null,
) {
  try {
    const envio = await twilio.enviarMensagem(conta, mensagem);
    await marcar(item.id, { status: "ENVIADO", messageSid: envio.sid, destino: mensagem.para, motivo: motivoSucesso });
    return "enviado" as const;
  } catch (erro) {
    const tentativas = item.tentativas + 1;
    const motivo = (erro instanceof ErroTwilio ? erro.message : "Falha ao enviar WhatsApp.").slice(0, 180);
    if (tentativas >= TENTATIVAS_MAX) {
      await prisma.filaWhatsapp.update({
        where: { id: item.id },
        data: { status: "FALHOU", tentativas, motivo },
      });
      return "falha" as const;
    }
    await prisma.filaWhatsapp.update({
      where: { id: item.id },
      data: {
        status: "PENDENTE",
        tentativas,
        motivo,
        disponivelEm: new Date(agora.getTime() + 15 * 60 * 1000),
      },
    });
    return "adiado" as const;
  }
}

export async function processarFilaWhatsapp(
  opcoes: {
    agora?: Date;
    empresaId?: string;
    twilio?: ClienteTwilio;
    limite?: number;
    tipos?: TipoTemplateWhatsapp[];
    faturaIds?: string[];
    conciliar?: boolean;
  } = {},
): Promise<{ enviados: number; falhas: number; ignorados: number }> {
  const agora = opcoes.agora ?? new Date();
  const twilio = opcoes.twilio;
  if (!twilio) return { enviados: 0, falhas: 0, ignorados: 0 };
  const filtroEmpresa = opcoes.empresaId ? { empresaId: opcoes.empresaId } : {};
  const filtroFaturas = opcoes.faturaIds?.length ? { faturaId: { in: opcoes.faturaIds } } : {};
  const resultado = { enviados: 0, falhas: 0, ignorados: 0 };
  const travado = new Date(agora.getTime() - 10 * 60 * 1000);
  await prisma.filaWhatsapp.updateMany({
    where: { ...filtroEmpresa, ...filtroFaturas, status: "PROCESSANDO", messageSid: null, atualizadoEm: { lt: travado } },
    data: { status: "PENDENTE" },
  });

  const pendentes = await prisma.filaWhatsapp.findMany({
    where: {
      ...filtroEmpresa,
      ...filtroFaturas,
      status: "PENDENTE",
      disponivelEm: { lte: agora },
      ...(opcoes.tipos ? { tipo: { in: opcoes.tipos } } : {}),
    },
    orderBy: { criadoEm: "asc" },
    take: opcoes.limite ?? 20,
    include: { cliente: true, fatura: true },
  });

  const hojeFila = dataHojeIso(agora);
  const empresasFila = [...new Set(pendentes.map((item) => item.empresaId))];
  if (opcoes.conciliar !== false) {
    for (const empresaId of empresasFila) await conciliarPromessas(empresaId, hojeFila);
  }
  const promessasAtivas = new Set<string>();
  if (pendentes.length > 0) {
    const linhas = await prisma.promessaPagamento.findMany({
      where: {
        empresaId: { in: empresasFila },
        faturaId: { in: pendentes.map((item) => item.faturaId) },
        status: "PENDENTE",
        dataPrometida: { gte: new Date(`${hojeFila}T00:00:00.000Z`) },
      },
      select: { empresaId: true, faturaId: true },
    });
    for (const linha of linhas) promessasAtivas.add(`${linha.empresaId}:${linha.faturaId}`);
  }

  for (const item of pendentes) {
    const reivindicado = await prisma.filaWhatsapp.updateMany({
      where: { id: item.id, status: "PENDENTE" },
      data: { status: "PROCESSANDO" },
    });
    if (reivindicado.count !== 1) continue;

    if (item.tipo !== "PAGO" && promessasAtivas.has(`${item.empresaId}:${item.faturaId}`)) {
      await marcar(item.id, { status: "IGNORADO", motivo: "promessa de pagamento", destino: null });
      resultado.ignorados += 1;
      continue;
    }

    const inelegivel = motivoInelegivel(item.tipo, {
      status: item.fatura.status,
      excluida: item.fatura.excluida,
      provedor: item.fatura.provedor,
    });
    if (inelegivel) {
      await marcar(item.id, { status: "IGNORADO", motivo: inelegivel, destino: null });
      resultado.ignorados += 1;
      continue;
    }

    const [conexao, regua, template, decisao] = await Promise.all([
      prisma.configuracaoTwilio.findUnique({ where: { empresaId: item.empresaId } }),
      prisma.configuracaoRegua.findUnique({ where: { empresaId: item.empresaId } }),
      prisma.templateWhatsapp.findUnique({
        where: { empresaId_tipo: { empresaId: item.empresaId, tipo: item.tipo } },
      }),
      decidirSubcontaWhatsapp(item.empresaId, item.tipo),
    ]);
    // Fila criada no modo teste não passa a ir para o cliente se a régua sair do teste.
    const modoEfetivo = item.modoTeste || Boolean(regua?.modoTeste);
    const regra = await destinoEMotivo(prisma, item.empresaId, item.cliente, modoEfetivo);
    if (regra.motivo || !regra.destino) {
      await marcar(item.id, { status: "IGNORADO", motivo: regra.motivo ?? "sem destino", destino: null });
      resultado.ignorados += 1;
      continue;
    }
    const clienteE164 = whatsappE164(item.cliente.whatsapp);
    if (modoEfetivo && clienteE164 && regra.destino === `whatsapp:${clienteE164}`) {
      const teste = whatsappE164(numeroTesteWhatsapp() ?? "");
      if (!teste || teste !== clienteE164) {
        await marcar(item.id, { status: "IGNORADO", motivo: "modo teste não envia para o cliente", destino: null });
        resultado.ignorados += 1;
        continue;
      }
    }
    if (decisao.usar) {
      if (!modoEfetivo) {
        const teste = whatsappE164(numeroTesteWhatsapp() ?? "");
        if (!clienteE164 || regra.destino !== `whatsapp:${clienteE164}` || regra.destino === REMETENTE_SANDBOX_WHATSAPP) {
          await marcar(item.id, { status: "IGNORADO", motivo: "destino não é o WhatsApp do cliente", destino: null });
          resultado.ignorados += 1;
          continue;
        }
        if (teste && regra.destino === `whatsapp:${teste}` && teste !== clienteE164) {
          await marcar(item.id, { status: "IGNORADO", motivo: "produção não envia para o número de teste", destino: null });
          resultado.ignorados += 1;
          continue;
        }
      }
      const variaveisEmpresa = variaveisGravadas(item.variaveis);
      if (!variaveisEmpresa || !variaveisCompativeisComTemplate(item.tipo, variaveisEmpresa)) {
        await marcar(item.id, { status: "FALHOU", motivo: "variáveis inválidas" });
        resultado.falhas += 1;
        continue;
      }
      const envioEmpresa = await concluirEnvio(twilio, item, agora, decisao.conta, {
        de: decisao.de,
        para: regra.destino,
        contentSid: decisao.contentSid,
        variaveis: variaveisEmpresa,
        statusCallback: decisao.statusCallback,
      });
      if (envioEmpresa === "enviado") resultado.enviados += 1;
      if (envioEmpresa === "falha") resultado.falhas += 1;
      continue;
    }
    if (decisao.motivo) registrarFallbackSubconta(item.empresaId, item.tipo, decisao.motivo);
    const producaoPronta = Boolean(
      conexao &&
        conexao.senderStatus === "ONLINE" &&
        conexao.senderTelefone &&
        template?.contentSid &&
        template.status === "APROVADO",
    );
    const rota = rotaWhatsapp({
      modoTeste: modoEfetivo,
      oficialLigado: remetenteOficialLigado(),
      sandboxLigado: usarSandboxWhatsapp(true),
      empresaPronta: producaoPronta,
      producaoLiberada: faturaLiberadaOficial(item.fatura.criadoEm),
    });
    const oficial = rota === "oficial_teste" || rota === "oficial_producao";
    const sandbox = rota === "sandbox";
    if (rota === "oficial_producao") {
      const teste = whatsappE164(numeroTesteWhatsapp() ?? "");
      if (!clienteE164 || regra.destino !== `whatsapp:${clienteE164}` || regra.destino === REMETENTE_SANDBOX_WHATSAPP) {
        await marcar(item.id, { status: "IGNORADO", motivo: "destino não é o WhatsApp do cliente", destino: null });
        resultado.ignorados += 1;
        continue;
      }
      if (teste && regra.destino === `whatsapp:${teste}` && teste !== clienteE164) {
        await marcar(item.id, { status: "IGNORADO", motivo: "produção não envia para o número de teste", destino: null });
        resultado.ignorados += 1;
        continue;
      }
    }
    if (!oficial && !sandbox && !producaoPronta) {
      const espera = await adiarOuIgnorar(
        item.id,
        item.criadoEm,
        agora,
        decisao.motivo ?? "template aguardando aprovação",
        decisao.motivo ?? "template ou sender não ficou pronto a tempo",
      );
      if (espera === "ignorado") resultado.ignorados += 1;
      continue;
    }
    const variaveis = variaveisGravadas(item.variaveis);
    if (!variaveis || !variaveisCompativeisComTemplate(item.tipo, variaveis)) {
      await marcar(item.id, { status: "FALHOU", motivo: "variáveis inválidas" });
      resultado.falhas += 1;
      continue;
    }

    let conta: CredencialTwilio;
    let mensagem: MensagemTemplate;
    if (oficial || sandbox) {
      const teste = whatsappE164(numeroTesteWhatsapp() ?? "");
      const destinoOficial = rota === "oficial_producao" ? regra.destino : `whatsapp:${teste ?? ""}`;
      if (rota !== "oficial_producao" && (!teste || regra.destino !== `whatsapp:${teste}`)) {
        await marcar(item.id, { status: "IGNORADO", motivo: "modo teste não envia para o cliente", destino: null });
        resultado.ignorados += 1;
        continue;
      }
      if (rota === "oficial_producao" && destinoOficial === REMETENTE_SANDBOX_WHATSAPP) {
        await marcar(item.id, { status: "IGNORADO", motivo: "sandbox não envia para o cliente", destino: null });
        resultado.ignorados += 1;
        continue;
      }
      const contentSid = contentSidSandbox(item.tipo);
      if (!contentSid) {
        const espera = await adiarOuIgnorar(
          item.id,
          item.criadoEm,
          agora,
          decisao.motivo ?? (oficial ? "remetente oficial sem ContentSid da conta pai" : "sandbox sem ContentSid da conta pai"),
        );
        if (espera === "ignorado") resultado.ignorados += 1;
        continue;
      }
      let statusCallback = "";
      try {
        statusCallback = urlWebhookTwilio();
      } catch {
        const espera = await adiarOuIgnorar(
          item.id,
          item.criadoEm,
          agora,
          oficial ? "remetente oficial sem webhook" : "sandbox sem webhook",
        );
        if (espera === "ignorado") resultado.ignorados += 1;
        continue;
      }
      try {
        conta = credenciaisPaiTwilio();
      } catch {
        const espera = await adiarOuIgnorar(
          item.id,
          item.criadoEm,
          agora,
          oficial ? "remetente oficial sem credencial da conta pai" : "sandbox sem credencial da conta pai",
        );
        if (espera === "ignorado") resultado.ignorados += 1;
        continue;
      }
      mensagem = {
        de: oficial ? REMETENTE_OFICIAL_WHATSAPP : REMETENTE_SANDBOX_WHATSAPP,
        para: destinoOficial,
        contentSid,
        variaveis,
        statusCallback,
      };
    } else if (!oficial && conexao?.senderTelefone && template?.contentSid) {
      let token = "";
      try {
        token = decifrarSegredoAsaas(conexao.authTokenCifrado);
      } catch {
        await marcar(item.id, { status: "FALHOU", motivo: "token ilegível" });
        resultado.falhas += 1;
        continue;
      }
      conta = { accountSid: conexao.subaccountSid, authToken: token };
      mensagem = {
        de: `whatsapp:${whatsappE164(conexao.senderTelefone) ?? conexao.senderTelefone}`,
        para: regra.destino,
        contentSid: template.contentSid,
        variaveis,
        statusCallback: conexao.webhookUrl,
      };
    } else {
      await marcar(item.id, { status: "IGNORADO", motivo: "template ou sender não ficou pronto a tempo" });
      resultado.ignorados += 1;
      continue;
    }

    const baseEnvio = { conta, de: mensagem.de, statusCallback: mensagem.statusCallback };
    // Sem modelo aprovado na subconta, não trocamos a conta: o ContentSid da pai
    // não existe na subconta. O motivo fica na fila.
    const remetente = decisao.motivo
      ? { ...baseEnvio, origem: "global" as const }
      : await aplicarRemetenteEmpresa(item.empresaId, "WHATSAPP", baseEnvio);
    const envio = await concluirEnvio(
      twilio,
      item,
      agora,
      remetente.conta,
      { ...mensagem, de: remetente.de, statusCallback: remetente.statusCallback },
      decisao.motivo,
    );
    if (envio === "enviado") resultado.enviados += 1;
    if (envio === "falha") resultado.falhas += 1;
  }

  return resultado;
}
