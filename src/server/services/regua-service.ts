import { cifrarSegredoAsaas, decifrarSegredoAsaas } from "@/lib/asaas-cripto";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import {
  assuntoRegua,
  dataSaoPaulo,
  diasAtraso,
  NOME_REGUA_SUGERIDA,
  PASSOS_SUGERIDOS,
  rotuloPasso,
  textoRegua,
} from "@/lib/regua";
import type {
  AtribuicaoReguaDTO,
  ConfiguracaoReguaDTO,
  LembreteReguaDTO,
  PassoReguaDTO,
  ReguaDTO,
} from "@/lib/tipos";
import { esquemaAtribuicaoRegua, esquemaConfiguracaoRegua, esquemaLembreteManual, esquemaRegua } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirCobranca, exigirRegua, exigirVerRegua } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { dispararLembrete } from "@/server/regua/envio";
import { clienteResendPadrao, remetenteResend, type ClienteResend } from "@/server/regua/resend";
import { lerEsquema } from "@/server/validar";
import { isoDeData } from "@/lib/data";

type LinhaPasso = {
  id: string;
  ordem: number;
  naEmissao: boolean;
  dias: number | null;
  canal: string;
  assunto: string;
  corpo: string;
};

type LinhaRegua = {
  id: string;
  nome: string;
  padrao: boolean;
  horaInicio: number;
  horaFim: number;
  enviarFimDeSemana: boolean;
  passos: LinhaPasso[];
};

const configVazia: ConfiguracaoReguaDTO = {
  gravada: false,
  ativa: false,
  modoTeste: true,
  remetenteNome: "",
  remetenteEmail: "",
  replyTo: "",
  configurada: false,
};

function paraPasso(passo: LinhaPasso): PassoReguaDTO {
  return {
    id: passo.id,
    ordem: passo.ordem,
    naEmissao: passo.naEmissao,
    dias: passo.dias,
    canal: "EMAIL",
    assunto: passo.assunto,
    corpo: passo.corpo,
    rotulo: rotuloPasso(passo),
  };
}

function paraRegua(regua: LinhaRegua): ReguaDTO {
  return {
    id: regua.id,
    nome: regua.nome,
    padrao: regua.padrao,
    horaInicio: regua.horaInicio,
    horaFim: regua.horaFim,
    enviarFimDeSemana: regua.enviarFimDeSemana,
    passos: [...regua.passos].sort((a, b) => a.ordem - b.ordem).map(paraPasso),
  };
}

function paraConfig(linha: {
  ativa: boolean;
  modoTeste: boolean;
  remetenteNome: string | null;
  remetenteEmail: string | null;
  replyTo: string | null;
  chaveResendCifrada: string | null;
} | null): ConfiguracaoReguaDTO {
  if (!linha) return configVazia;
  return {
    gravada: true,
    ativa: linha.ativa,
    modoTeste: linha.modoTeste,
    remetenteNome: linha.remetenteNome ?? "",
    remetenteEmail: linha.remetenteEmail ?? "",
    replyTo: linha.replyTo ?? "",
    configurada: Boolean(linha.chaveResendCifrada),
  };
}

function vazio(valor: string): string | null {
  const texto = valor.trim();
  return texto ? texto : null;
}

function cifrarChaveResend(chave: string): string {
  try {
    return cifrarSegredoAsaas(chave);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.codigo === "asaas_sem_chave") {
      throw new ErroAplicacao(
        "Defina ASAAS_ENCRYPTION_KEY no servidor para guardar a chave da Resend.",
        500,
        "regua_sem_chave",
      );
    }
    throw erro;
  }
}

function abrirChaveResend(cifra: string): string {
  try {
    return decifrarSegredoAsaas(cifra);
  } catch {
    throw new ErroAplicacao("A chave da Resend está ilegível.", 500, "regua_ilegivel");
  }
}

async function listarReguas(empresaId: string): Promise<ReguaDTO[]> {
  const reguas = await prisma.reguaCobranca.findMany({
    where: { empresaId },
    include: { passos: { orderBy: { ordem: "asc" } } },
    orderBy: [{ padrao: "desc" }, { nome: "asc" }],
  });
  return reguas.map(paraRegua);
}

export async function obterPainelRegua(autor: AutorEmpresa) {
  exigirVerRegua(autor);
  const config = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
  return { config: paraConfig(config), reguas: await listarReguas(autor.empresaId) };
}

function ehNomeDuplicado(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

export async function salvarConfiguracaoRegua(autor: AutorEmpresa, entrada: unknown) {
  exigirRegua(autor);
  const dados = lerEsquema(esquemaConfiguracaoRegua, entrada);
  const anterior = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
  const ligando = !anterior?.ativa && dados.ativa;
  const chaveResendCifrada = dados.chaveResend ? cifrarChaveResend(dados.chaveResend) : anterior?.chaveResendCifrada ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.configuracaoRegua.upsert({
      where: { empresaId: autor.empresaId },
      create: {
        empresaId: autor.empresaId,
        ativa: dados.ativa,
        modoTeste: dados.modoTeste,
        remetenteNome: vazio(dados.remetenteNome),
        remetenteEmail: vazio(dados.remetenteEmail),
        replyTo: vazio(dados.replyTo),
        chaveResendCifrada,
      },
      update: {
        ativa: dados.ativa,
        modoTeste: dados.modoTeste,
        remetenteNome: vazio(dados.remetenteNome),
        remetenteEmail: vazio(dados.remetenteEmail),
        replyTo: vazio(dados.replyTo),
        chaveResendCifrada,
      },
    });

    if (!ligando) return;
    const quantidade = await tx.reguaCobranca.count({ where: { empresaId: autor.empresaId } });
    if (quantidade > 0) return;
    await tx.reguaCobranca.create({
      data: {
        empresaId: autor.empresaId,
        nome: NOME_REGUA_SUGERIDA,
        padrao: true,
        horaInicio: 8,
        horaFim: 18,
        enviarFimDeSemana: false,
        passos: {
          create: PASSOS_SUGERIDOS.map((passo, ordem) => ({
            empresaId: autor.empresaId,
            ordem,
            naEmissao: passo.naEmissao,
            dias: passo.dias,
            canal: "EMAIL",
            assunto: passo.assunto,
            corpo: passo.corpo,
          })),
        },
      },
    });
  });

  return obterPainelRegua(autor);
}

async function gravarPassos(
  tx: {
    passoRegua: {
      deleteMany(args: { where: { reguaId: string; empresaId: string; id?: { notIn: string[] } } }): Promise<unknown>;
      updateMany(args: { where: { id: string; reguaId: string; empresaId: string }; data: Record<string, unknown> }): Promise<{ count: number }>;
      create(args: { data: Record<string, unknown> }): Promise<unknown>;
    };
  },
  empresaId: string,
  reguaId: string,
  passos: { id?: string; naEmissao: boolean; dias: number | null; assunto: string; corpo: string }[],
) {
  const ids = passos.flatMap((passo) => (passo.id ? [passo.id] : []));
  await tx.passoRegua.deleteMany({
    where: { reguaId, empresaId, ...(ids.length > 0 ? { id: { notIn: ids } } : {}) },
  });
  for (let ordem = 0; ordem < passos.length; ordem += 1) {
    const passo = passos[ordem];
    const campos = {
      ordem,
      naEmissao: passo.naEmissao,
      dias: passo.naEmissao ? null : passo.dias,
      canal: "EMAIL",
      assunto: passo.assunto,
      corpo: passo.corpo,
    };
    if (passo.id) {
      const atualizado = await tx.passoRegua.updateMany({
        where: { id: passo.id, reguaId, empresaId },
        data: campos,
      });
      if (atualizado.count !== 1) {
        throw new ErroAplicacao("Passo não encontrado nesta régua.", 404, "nao_encontrado");
      }
    } else {
      await tx.passoRegua.create({
        data: { ...campos, reguaId, empresaId },
      });
    }
  }
}

export async function criarRegua(autor: AutorEmpresa, entrada: unknown) {
  exigirRegua(autor);
  const dados = lerEsquema(esquemaRegua, entrada);
  try {
    await prisma.$transaction(async (tx) => {
      const quantidade = await tx.reguaCobranca.count({ where: { empresaId: autor.empresaId } });
      const padrao = dados.padrao || quantidade === 0;
      if (padrao) {
        await tx.reguaCobranca.updateMany({ where: { empresaId: autor.empresaId }, data: { padrao: false } });
      }
      const regua = await tx.reguaCobranca.create({
        data: {
          empresaId: autor.empresaId,
          nome: dados.nome,
          padrao,
          horaInicio: dados.horaInicio,
          horaFim: dados.horaFim,
          enviarFimDeSemana: dados.enviarFimDeSemana,
        },
      });
      await gravarPassos(tx, autor.empresaId, regua.id, dados.passos);
    });
  } catch (erro) {
    if (ehNomeDuplicado(erro)) {
      throw new ErroAplicacao("Já existe uma régua com este nome.", 409, "nome_duplicado");
    }
    throw erro;
  }
  return obterPainelRegua(autor);
}

export async function atualizarRegua(autor: AutorEmpresa, reguaId: string, entrada: unknown) {
  exigirRegua(autor);
  const dados = lerEsquema(esquemaRegua, entrada);
  const atual = await prisma.reguaCobranca.findFirst({ where: { id: reguaId, empresaId: autor.empresaId } });
  if (!atual) throw new ErroAplicacao("Régua não encontrada.", 404, "nao_encontrado");

  try {
    await prisma.$transaction(async (tx) => {
      const outras = await tx.reguaCobranca.count({
        where: { empresaId: autor.empresaId, id: { not: reguaId } },
      });
      let padrao = dados.padrao;
      if (!padrao && atual.padrao && outras === 0) padrao = true;
      if (!padrao && atual.padrao && outras > 0) {
        throw new ErroAplicacao("Marque outra régua como padrão antes de tirar esta.", 400, "regua_padrao");
      }
      if (padrao) {
        await tx.reguaCobranca.updateMany({
          where: { empresaId: autor.empresaId, id: { not: reguaId } },
          data: { padrao: false },
        });
      }
      await tx.reguaCobranca.update({
        where: { id: reguaId },
        data: {
          nome: dados.nome,
          padrao,
          horaInicio: dados.horaInicio,
          horaFim: dados.horaFim,
          enviarFimDeSemana: dados.enviarFimDeSemana,
        },
      });
      await gravarPassos(tx, autor.empresaId, reguaId, dados.passos);
    });
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    if (ehNomeDuplicado(erro)) {
      throw new ErroAplicacao("Já existe uma régua com este nome.", 409, "nome_duplicado");
    }
    throw erro;
  }
  return obterPainelRegua(autor);
}

export async function excluirRegua(autor: AutorEmpresa, reguaId: string) {
  exigirRegua(autor);
  const atual = await prisma.reguaCobranca.findFirst({ where: { id: reguaId, empresaId: autor.empresaId } });
  if (!atual) throw new ErroAplicacao("Régua não encontrada.", 404, "nao_encontrado");
  const config = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
  const total = await prisma.reguaCobranca.count({ where: { empresaId: autor.empresaId } });
  if (total === 1 && config?.ativa) {
    throw new ErroAplicacao("Desligue a régua ou crie outra antes de apagar a única.", 400, "regua_unica");
  }

  await prisma.$transaction(async (tx) => {
    await tx.cliente.updateMany({
      where: { empresaId: autor.empresaId, reguaId },
      data: { reguaId: null, reguaModo: "PADRAO" },
    });
    if (atual.padrao && total > 1) {
      const outra = await tx.reguaCobranca.findFirst({
        where: { empresaId: autor.empresaId, id: { not: reguaId } },
        orderBy: { criadoEm: "asc" },
      });
      await tx.reguaCobranca.update({ where: { id: reguaId }, data: { padrao: false } });
      if (outra) await tx.reguaCobranca.update({ where: { id: outra.id }, data: { padrao: true } });
    }
    await tx.reguaCobranca.delete({ where: { id: reguaId } });
  });
  return obterPainelRegua(autor);
}

export async function atribuirReguaCliente(autor: AutorEmpresa, clienteId: string, entrada: unknown): Promise<AtribuicaoReguaDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaAtribuicaoRegua, entrada);
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId: autor.empresaId } });
  if (!cliente) throw new ErroAplicacao("Cliente não encontrado.", 404, "nao_encontrado");

  let reguaId: string | null = null;
  let nome: string | null = null;
  if (dados.modo === "ESPECIFICA") {
    const regua = await prisma.reguaCobranca.findFirst({
      where: { id: dados.reguaId ?? "", empresaId: autor.empresaId },
    });
    if (!regua) throw new ErroAplicacao("Régua não encontrada.", 404, "nao_encontrado");
    reguaId = regua.id;
    nome = regua.nome;
  } else if (dados.modo === "PADRAO") {
    const padrao = await prisma.reguaCobranca.findFirst({
      where: { empresaId: autor.empresaId, padrao: true },
      select: { nome: true },
    });
    nome = padrao?.nome ?? null;
  }

  await prisma.cliente.update({
    where: { id: clienteId },
    data: { reguaModo: dados.modo, reguaId, reguaPausada: dados.pausada },
  });

  return { modo: dados.modo, reguaId, pausada: dados.pausada, nome };
}

export async function enviarEmailTesteRegua(
  autor: AutorEmpresa & { email: string },
  opcoes: { resend?: ClienteResend } = {},
) {
  exigirRegua(autor);
  const config = await prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } });
  if (!config?.chaveResendCifrada || !config.remetenteEmail) {
    throw new ErroAplicacao("Configure o remetente e a chave da Resend antes de testar.", 400, "regua_incompleta");
  }
  const resend = opcoes.resend ?? clienteResendPadrao();
  await resend.enviar({
    chave: abrirChaveResend(config.chaveResendCifrada),
    de: remetenteResend(config.remetenteNome ?? "", config.remetenteEmail),
    para: autor.email,
    assunto: "E-mail de teste da régua de cobrança",
    texto: "Este é um e-mail de teste da régua de cobrança. Ele foi enviado só para o seu endereço.",
    replyTo: config.replyTo,
  });
  return { enviado: true };
}

export async function enviarLembreteAgora(
  autor: AutorEmpresa & { email: string; nomeEmpresa: string },
  faturaId: string,
  entrada: unknown,
  opcoes: { resend?: ClienteResend; agora?: Date } = {},
): Promise<LembreteReguaDTO> {
  exigirCobranca(autor);
  const dados = lerEsquema(esquemaLembreteManual, entrada);
  const agora = opcoes.agora ?? new Date();
  const [fatura, passo, config, empresa] = await Promise.all([
    prisma.fatura.findFirst({
      where: { id: faturaId, empresaId: autor.empresaId },
      include: {
        cliente: { select: { nomeFantasia: true, email: true } },
        clienteServico: { select: { servico: { select: { nome: true } } } },
      },
    }),
    prisma.passoRegua.findFirst({ where: { id: dados.passoId, empresaId: autor.empresaId } }),
    prisma.configuracaoRegua.findUnique({ where: { empresaId: autor.empresaId } }),
    prisma.empresa.findUnique({ where: { id: autor.empresaId }, select: { nomeFantasia: true } }),
  ]);
  if (!fatura) throw new ErroAplicacao("Fatura não encontrada.", 404, "nao_encontrado");
  if (fatura.excluida || (fatura.status !== "PENDING" && fatura.status !== "OVERDUE")) {
    throw new ErroAplicacao("Esta cobrança não está em aberto.", 400, "fatura_fechada");
  }
  if (!passo) throw new ErroAplicacao("Passo não encontrado.", 404, "nao_encontrado");
  if (!config?.chaveResendCifrada || !config.remetenteEmail) {
    throw new ErroAplicacao("Configure o remetente e a chave da Resend antes de enviar.", 400, "regua_incompleta");
  }

  const modoTeste = config.modoTeste;
  const destino = modoTeste ? autor.email : fatura.cliente.email.trim();
  if (!destino) throw new ErroAplicacao("O cliente não tem e-mail.", 400, "sem_email");

  const vencimento = isoDeData(fatura.vencimento);
  const valor = fatura.valor.toFixed(2);
  const corpo = textoRegua(passo.corpo, {
    cliente: fatura.cliente.nomeFantasia,
    servico: fatura.clienteServico?.servico.nome ?? fatura.descricao ?? "cobrança",
    valor: formatarReais(valor),
    vencimento: formatarDataIso(vencimento),
    link: fatura.boletoUrl ?? fatura.faturaUrl ?? "",
    diasAtraso: String(diasAtraso(dataSaoPaulo(agora), vencimento)),
    empresa: empresa?.nomeFantasia ?? autor.nomeEmpresa,
  });
  const texto = modoTeste
    ? `Modo teste: este e-mail foi enviado para você, não para o cliente.\n\n${corpo}`
    : corpo;

  const resultado = await dispararLembrete({
    empresaId: autor.empresaId,
    faturaId: fatura.id,
    clienteId: fatura.clienteId,
    passoId: passo.id,
    rotulo: rotuloPasso(passo),
    automatico: false,
    modoTeste,
    destino,
    assunto: assuntoRegua(passo.assunto, modoTeste),
    texto,
    de: remetenteResend(config.remetenteNome ?? "", config.remetenteEmail),
    replyTo: config.replyTo,
    chave: abrirChaveResend(config.chaveResendCifrada),
    resend: opcoes.resend ?? clienteResendPadrao(),
  });
  return resultado.lembrete;
}
