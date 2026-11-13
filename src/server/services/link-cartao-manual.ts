import { decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { isoDeData } from "@/lib/data";
import { formatarReais } from "@/lib/dinheiro";
import { montarEmailAviso } from "@/lib/email-aviso";
import { formatarDataIso } from "@/lib/formatacao";
import { emailDeCobranca } from "@/lib/remetentes";
import { assuntoRegua, dataSaoPaulo, diasAtraso, textoRegua } from "@/lib/regua";
import { rotuloStatusFatura } from "@/lib/rotulos";
import { passoEmissaoAplicavel } from "@/lib/reenvio-boleto";
import { provedorCodigo, statusEh } from "@/lib/status-pagamento";
import type { ResultadoCanalReenvio } from "@/lib/tipos";
import { ROTULO_WHATSAPP_LINK_CARTAO, resolverWhatsappDoPasso } from "@/lib/whatsapp-cobranca";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { dispararLembrete, registrarIgnorado, textoErroEnvio } from "@/server/regua/envio";
import { clienteResendPadrao, remetenteResend, type ClienteResend } from "@/server/regua/resend";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { clienteTwilioPadrao } from "@/server/twilio/fabrica";
import { urlLogoParaEmail } from "./logo-empresa-service";
import { enfileirarWhatsappDoPasso, processarFilaWhatsapp } from "./whatsapp-fila";
import { motivoWhatsappNaoAplica, type FaturaWhatsappPasso, type PassoWhatsapp } from "./whatsapp-passo";

const JANELA_CLIQUE_MS = 60_000;
const ROTULO_EMAIL = "Link do cartão";

export type CanalLinkCartao = "EMAIL" | "WHATSAPP";

export type ResultadoEnvioLinkCartao = {
  canal: CanalLinkCartao;
  resultado: ResultadoCanalReenvio["resultado"];
  mensagem: string;
  modoTeste: boolean;
};

type AlvoLinkCartao = { faturaId: string } | { clienteServicoId: string };

type OpcoesEnvio = {
  agora?: Date;
  resend?: ClienteResend;
  twilio?: ClienteTwilio;
};

const FRASES: Record<string, string> = {
  "cliente sem e-mail": "Cliente sem e-mail.",
  "cliente sem WhatsApp": "Cliente sem WhatsApp.",
  "opt-out": "Opt-out.",
  "régua pausada": "Régua pausada.",
  "cliente bloqueado": "Cliente bloqueado.",
  "sem régua": "Canal desligado.",
  "sem régua padrão": "Canal desligado.",
  "Este passo não envia WhatsApp.": "Canal desligado.",
  "WhatsApp não conectado": "WhatsApp não conectado.",
  "sender ainda não está online": "WhatsApp ainda não está online.",
  "modo teste sem número de teste": "Modo teste sem número de teste.",
  "modo teste sem dono": "Modo teste sem dono.",
  "remetente não configurado": "Remetente não configurado.",
  "chave ilegível": "Remetente não configurado.",
  "cobrança sem link do Asaas": "A cobrança não tem link.",
  "WhatsApp oficial ainda não vale para esta cobrança.": "WhatsApp oficial ainda não vale para esta cobrança.",
};

function frase(motivo: string | null | undefined, reserva: string) {
  const texto = motivo?.trim() ?? "";
  if (!texto) return reserva;
  return FRASES[texto] ?? (texto.endsWith(".") ? texto : `${texto}.`);
}

function resultado(
  canal: CanalLinkCartao,
  tipo: ResultadoCanalReenvio["resultado"],
  mensagem: string,
  modoTeste: boolean,
): ResultadoEnvioLinkCartao {
  return { canal, resultado: tipo, mensagem, modoTeste };
}

function chaveOuNula(cifra: string | null): { chave: string | null; motivo: string | null } {
  if (!cifra) return { chave: null, motivo: "remetente não configurado" };
  try {
    return { chave: decifrarSegredoAsaas(cifra), motivo: null };
  } catch (erro) {
    textoErroEnvio(erro);
    return { chave: null, motivo: "chave ilegível" };
  }
}

const includeFatura = {
  cliente: true,
  clienteServico: { select: { servico: { select: { nome: true } } } },
} as const;

async function carregarFatura(empresaId: string, alvo: AlvoLinkCartao) {
  if ("faturaId" in alvo) {
    const fatura = await prisma.fatura.findFirst({
      where: { id: alvo.faturaId, empresaId },
      include: includeFatura,
    });
    if (!fatura) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
    if (fatura.formaCobranca !== "CREDIT_CARD") {
      throw new ErroAplicacao("Este envio é só para o link do cartão.", 409, "forma_indisponivel");
    }
    return fatura;
  }
  const candidatas = await prisma.fatura.findMany({
    where: {
      empresaId,
      clienteServicoId: alvo.clienteServicoId,
      formaCobranca: "CREDIT_CARD",
      excluida: false,
    },
    include: includeFatura,
    orderBy: { criadoEm: "desc" },
    take: 20,
  });
  const aberta = candidatas.find(
    (fatura) =>
      statusEh(fatura.status, "REGUA_ABERTA", provedorCodigo(fatura.provedor)) &&
      Boolean(fatura.faturaUrl?.trim() || fatura.boletoUrl?.trim()),
  );
  if (!aberta) {
    throw new ErroAplicacao("Não há cobrança de cartão em aberto para enviar o link.", 409, "fatura_fechada");
  }
  return aberta;
}

function exigeAberta(fatura: { status: string; excluida: boolean; provedor: string; faturaUrl: string | null; boletoUrl: string | null }) {
  if (fatura.excluida || !statusEh(fatura.status, "REGUA_ABERTA", provedorCodigo(fatura.provedor))) {
    throw new ErroAplicacao("Cobrança não está em aberto.", 409, "fatura_fechada");
  }
  if (!fatura.faturaUrl?.trim() && !fatura.boletoUrl?.trim()) {
    throw new ErroAplicacao("A cobrança não tem link.", 409, "sem_link");
  }
}

async function passoDaEmpresa(
  empresaId: string,
  cliente: { reguaModo: string; reguaId: string | null },
) {
  const [config, reguas] = await Promise.all([
    prisma.configuracaoRegua.findUnique({ where: { empresaId } }),
    prisma.reguaCobranca.findMany({ where: { empresaId }, include: { passos: true } }),
  ]);
  const escolhido = passoEmissaoAplicavel(cliente, reguas);
  const passo = escolhido ? reguas.flatMap((regua) => regua.passos).find((item) => item.id === escolhido.id) ?? null : null;
  return { config, passo };
}

async function ignorarEmail(
  empresaId: string,
  faturaId: string,
  clienteId: string,
  passoId: string | null,
  modoTeste: boolean,
  motivo: string,
) {
  await registrarIgnorado({
    empresaId,
    faturaId,
    clienteId,
    passoId,
    modoTeste,
    rotulo: ROTULO_EMAIL,
    motivo,
  });
}

export async function enviarLinkCartaoManual(
  autor: AutorEmpresa & { email: string; nomeEmpresa: string },
  alvo: AlvoLinkCartao,
  canal: CanalLinkCartao,
  opcoes: OpcoesEnvio = {},
): Promise<ResultadoEnvioLinkCartao> {
  exigirCobranca(autor);
  const agora = opcoes.agora ?? new Date();
  const fatura = await carregarFatura(autor.empresaId, alvo);
  exigeAberta(fatura);
  const cliente = fatura.cliente;
  const { config, passo } = await passoDaEmpresa(autor.empresaId, cliente);
  const modoTeste = Boolean(config?.modoTeste);
  const canalLigado = Boolean(config?.ativa && passo && (canal === "EMAIL" || passo.enviarWhatsapp));

  if (cliente.status === "BLOQUEADO") {
    if (canal === "EMAIL") await ignorarEmail(autor.empresaId, fatura.id, cliente.id, passo?.id ?? null, modoTeste, "cliente bloqueado");
    else await ignorarWhatsapp(fatura, passo, modoTeste, agora, "cliente bloqueado");
    return resultado(canal, "ignorado", frase("cliente bloqueado", "Cliente bloqueado."), modoTeste);
  }
  if (cliente.reguaPausada) {
    if (canal === "EMAIL") await ignorarEmail(autor.empresaId, fatura.id, cliente.id, passo?.id ?? null, modoTeste, "régua pausada");
    else await ignorarWhatsapp(fatura, passo, modoTeste, agora, "régua pausada");
    return resultado(canal, "ignorado", frase("régua pausada", "Régua pausada."), modoTeste);
  }
  if (!canalLigado || !passo || !config?.ativa) {
    if (canal === "EMAIL") await ignorarEmail(autor.empresaId, fatura.id, cliente.id, passo?.id ?? null, modoTeste, "Canal desligado.");
    else await ignorarWhatsapp(fatura, passo, modoTeste, agora, "Canal desligado.");
    return resultado(canal, "ignorado", "Canal desligado.", modoTeste);
  }

  if (canal === "EMAIL") {
    return enviarEmail(autor, fatura, config, passo, modoTeste, agora, opcoes.resend ?? clienteResendPadrao());
  }
  return enviarWhatsapp(fatura, passo, modoTeste, agora, opcoes.twilio ?? clienteTwilioPadrao());
}

async function ignorarWhatsapp(
  fatura: { id: string; empresaId: string; clienteId: string },
  passo: { id: string } | null,
  modoTeste: boolean,
  agora: Date,
  motivo: string,
  db: Pick<typeof prisma, "filaWhatsapp"> = prisma,
) {
  const chave = `wa:${fatura.empresaId}:${fatura.id}:manual:${motivo.slice(0, 40)}`;
  try {
    await db.filaWhatsapp.create({
      data: {
        empresaId: fatura.empresaId,
        faturaId: fatura.id,
        clienteId: fatura.clienteId,
        passoId: passo?.id ?? null,
        tipo: "VENCE_EM_DIAS",
        chaveIdempotencia: chave,
        status: "IGNORADO",
        motivo,
        modoTeste,
        rotulo: ROTULO_WHATSAPP_LINK_CARTAO,
        variaveis: "{}",
        disponivelEm: agora,
      },
    });
  } catch (erro) {
    if (!(typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002")) throw erro;
  }
}

async function enviarEmail(
  autor: AutorEmpresa & { email: string; nomeEmpresa: string },
  fatura: Awaited<ReturnType<typeof carregarFatura>>,
  config: { chaveResendCifrada: string | null; remetenteNome: string | null; remetenteEmail: string | null; replyTo: string | null },
  passo: { id: string; naEmissao: boolean; dias: number | null; assunto: string; corpo: string },
  modoTeste: boolean,
  agora: Date,
  resend: ClienteResend,
): Promise<ResultadoEnvioLinkCartao> {
  const cliente = fatura.cliente;
  const destino = modoTeste ? autor.email.trim() : cliente.email.trim();
  if (!destino) {
    const motivo = modoTeste ? "modo teste sem dono" : "cliente sem e-mail";
    await ignorarEmail(autor.empresaId, fatura.id, cliente.id, passo.id, modoTeste, motivo);
    return resultado("EMAIL", "ignorado", frase(motivo, "Cliente sem e-mail."), modoTeste);
  }
  const segredo = chaveOuNula(config.chaveResendCifrada);
  const remetente = emailDeCobranca(config.remetenteEmail);
  const chave = segredo.chave;
  if (!chave || !remetente) {
    const motivo = segredo.motivo ?? "remetente não configurado";
    await ignorarEmail(autor.empresaId, fatura.id, cliente.id, passo.id, modoTeste, motivo);
    return resultado("EMAIL", "ignorado", frase(motivo, "Remetente não configurado."), modoTeste);
  }

  const corte = new Date(agora.getTime() - JANELA_CLIQUE_MS);
  const logoUrl = await urlLogoParaEmail(autor.empresaId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fatura.id}), hashtext('cartao-email'))`;
    const recente = await tx.lembreteRegua.findFirst({
      where: { faturaId: fatura.id, canal: "EMAIL", status: "ENVIADO", criadoEm: { gte: corte } },
    });
    if (recente) return resultado("EMAIL", "aceito", "Este envio já saiu agora.", modoTeste);

    const hoje = dataSaoPaulo(agora);
    const vencimento = isoDeData(fatura.vencimento);
    const campos = {
      cliente: cliente.nomeFantasia,
      servico: fatura.clienteServico?.servico.nome ?? fatura.descricao ?? "cobrança",
      valor: formatarReais(fatura.valor.toFixed(2)),
      vencimento: formatarDataIso(vencimento),
      link: fatura.boletoUrl ?? fatura.faturaUrl ?? "",
      diasAtraso: String(diasAtraso(hoje, vencimento)),
      empresa: autor.nomeEmpresa,
    };
    const corpo = textoRegua(passo.corpo, campos);
    const carta = montarEmailAviso({
      empresa: autor.nomeEmpresa,
      cliente: campos.cliente,
      servico: campos.servico,
      valor: campos.valor,
      vencimento: campos.vencimento,
      status: rotuloStatusFatura(fatura.status, fatura.excluida),
      link: campos.link,
      linhaDigitavel: fatura.linhaDigitavel,
      pixCopiaCola: fatura.pixCopiaCola,
      logoUrl,
      mensagem: corpo,
      modoTeste,
    });
    try {
      await dispararLembrete({
        empresaId: autor.empresaId,
        faturaId: fatura.id,
        clienteId: cliente.id,
        passoId: passo.id,
        rotulo: ROTULO_EMAIL,
        automatico: false,
        modoTeste,
        destino,
        assunto: assuntoRegua(textoRegua(passo.assunto, campos), modoTeste),
        texto: carta.texto,
        html: carta.html,
        de: remetenteResend(config.remetenteNome ?? "", remetente),
        replyTo: config.replyTo,
        chave,
        resend,
        db: tx,
      });
    } catch (erro) {
      return resultado("EMAIL", "falha", frase(textoErroEnvio(erro), "Falha ao enviar."), modoTeste);
    }
    return resultado(
      "EMAIL",
      "aceito",
      modoTeste ? "Modo teste. O e-mail foi para você, não para o cliente." : "E-mail enviado.",
      modoTeste,
    );
  }, { timeout: 20_000 });
}

function faturaWhatsapp(fatura: Awaited<ReturnType<typeof carregarFatura>>): FaturaWhatsappPasso {
  return {
    id: fatura.id,
    empresaId: fatura.empresaId,
    valor: fatura.valor,
    vencimento: fatura.vencimento,
    boletoUrl: fatura.boletoUrl,
    faturaUrl: fatura.faturaUrl,
    excluida: fatura.excluida,
    criadoEm: fatura.criadoEm,
    formaCobranca: fatura.formaCobranca,
    cliente: {
      id: fatura.cliente.id,
      nomeFantasia: fatura.cliente.nomeFantasia,
      whatsapp: fatura.cliente.whatsapp,
      status: fatura.cliente.status,
      reguaModo: fatura.cliente.reguaModo,
      reguaPausada: fatura.cliente.reguaPausada,
    },
  };
}

async function enviarWhatsapp(
  fatura: Awaited<ReturnType<typeof carregarFatura>>,
  passo: { id: string; naEmissao: boolean; dias: number | null; enviarWhatsapp: boolean },
  modoTeste: boolean,
  agora: Date,
  twilio: ClienteTwilio,
): Promise<ResultadoEnvioLinkCartao> {
  const linhaFatura = faturaWhatsapp(fatura);
  const passoWa: PassoWhatsapp = {
    id: passo.id,
    naEmissao: passo.naEmissao,
    dias: passo.dias,
    enviarWhatsapp: passo.enviarWhatsapp,
  };
  const resolvido = resolverWhatsappDoPasso(passoWa, linhaFatura, agora);
  const bloqueio = motivoWhatsappNaoAplica(linhaFatura, passoWa, modoTeste, agora);
  if (!resolvido || bloqueio) {
    const motivo = bloqueio ?? "Canal desligado.";
    await ignorarWhatsapp(fatura, passo, modoTeste, agora, motivo);
    return resultado("WHATSAPP", "ignorado", frase(motivo, "Canal desligado."), modoTeste);
  }

  const corte = new Date(agora.getTime() - JANELA_CLIQUE_MS);
  const sufixo = `m${Math.floor(agora.getTime() / JANELA_CLIQUE_MS)}`;
  const preparo = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${fatura.id}), hashtext('cartao-whatsapp'))`;
    const recente = await tx.filaWhatsapp.findFirst({
      where: {
        empresaId: fatura.empresaId,
        faturaId: fatura.id,
        rotulo: ROTULO_WHATSAPP_LINK_CARTAO,
        status: "ENVIADO",
        criadoEm: { gte: corte },
      },
    });
    if (recente) return { enviar: false as const, resultado: resultado("WHATSAPP", "aceito", "Este envio já saiu agora.", modoTeste) };

    const pendente = await tx.filaWhatsapp.findFirst({
      where: {
        empresaId: fatura.empresaId,
        faturaId: fatura.id,
        rotulo: ROTULO_WHATSAPP_LINK_CARTAO,
        status: { in: ["PENDENTE", "PROCESSANDO"] },
      },
    });
    if (!pendente) {
      const fila = await enfileirarWhatsappDoPasso(linhaFatura, passoWa, modoTeste, agora, tx, sufixo);
      if (fila === "nao_aplica") {
        await ignorarWhatsapp(fatura, passo, modoTeste, agora, "WhatsApp oficial ainda não vale para esta cobrança.", tx);
        return {
          enviar: false as const,
          resultado: resultado("WHATSAPP", "ignorado", "WhatsApp oficial ainda não vale para esta cobrança.", modoTeste),
        };
      }
    }
    return { enviar: true as const };
  }, { timeout: 20_000 });
  if (!preparo.enviar) return preparo.resultado;

  await processarFilaWhatsapp({
    agora,
    empresaId: fatura.empresaId,
    twilio,
    faturaIds: [fatura.id],
    tipos: [resolvido.tipo],
    limite: 5,
    conciliar: false,
  });
  const linha = await prisma.filaWhatsapp.findFirst({
    where: { empresaId: fatura.empresaId, faturaId: fatura.id, rotulo: ROTULO_WHATSAPP_LINK_CARTAO },
    orderBy: { criadoEm: "desc" },
  });
  if (!linha || linha.status === "IGNORADO") {
    return resultado("WHATSAPP", "ignorado", frase(linha?.motivo, "WhatsApp ignorado."), modoTeste);
  }
  if (linha.status === "FALHOU") return resultado("WHATSAPP", "falha", frase(linha.motivo, "Falha ao enviar."), modoTeste);
  if (linha.status === "ENVIADO") {
    const mensagem = modoTeste
      ? "Modo teste. O WhatsApp foi para o número de teste, não para o cliente."
      : "WhatsApp enviado.";
    return resultado("WHATSAPP", "aceito", mensagem, modoTeste);
  }
  return resultado("WHATSAPP", "na_fila", frase(linha.motivo, "WhatsApp na fila."), modoTeste);
}
