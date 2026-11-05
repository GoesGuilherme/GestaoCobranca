import type { CanalWhatsappDTO, ProvedorWhatsapp, StatusCanalEvolution } from "@/lib/tipos";
import { esquemaAlertaWhatsapp, esquemaProvedorWhatsapp } from "@/lib/validacao";
import { formatarWhatsapp, somenteDigitos } from "@/lib/documento";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirRegua, exigirVerRegua } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroEvolution, type ClienteEvolution, type EstadoEvolution } from "@/server/evolution/contrato";
import {
  clienteEvolutionPadrao,
  evolutionLigada,
  segredoWebhookEvolution,
  urlWebhookEvolution,
} from "@/server/evolution/fabrica";
import { qrConfiavel } from "@/server/evolution/qr";
import { ErroAplicacao } from "@/server/erros";
import { exigirFolga, registrarTentativa } from "@/server/seguranca/limite";
import { nomeInstanciaDaEmpresa } from "@/server/whatsapp/selecao";
import { lerEsquema } from "@/server/validar";
import { abrirAlerta, listarAlertasDaEmpresa, resolverAlerta, type CodigoAlerta } from "./alerta-empresa";

const JANELA_MS = 10 * 60 * 1000;
const LIMITE_CONEXAO = 8;
const LIMITE_STATUS = 30;
const LIMITE_PROVEDOR = 10;

const canalVazio = (flag: boolean): CanalWhatsappDTO => ({
  evolutionHabilitada: flag,
  provedor: "TWILIO",
  status: "AUSENTE",
  telefone: null,
  erro: null,
  qrCode: null,
  alertas: [],
});

function statusDe(valor: string | null | undefined): StatusCanalEvolution {
  if (valor === "DESCONECTADO" || valor === "CONECTANDO" || valor === "CONECTADO" || valor === "ERRO") return valor;
  return "AUSENTE";
}

function provedorDe(valor: string | null | undefined): ProvedorWhatsapp {
  return valor === "EVOLUTION" ? "EVOLUTION" : "TWILIO";
}

function telefoneExibicao(valor: string | null): string | null {
  if (!valor) return null;
  const digitos = somenteDigitos(valor);
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return formatarWhatsapp(digitos.slice(2));
  }
  if (digitos.length === 10 || digitos.length === 11) return formatarWhatsapp(digitos);
  return null;
}

function exigirFlag() {
  if (!evolutionLigada()) {
    throw new ErroAplicacao("A conexão por QR Code ainda não está liberada neste ambiente.", 404, "evolution_desligada");
  }
}

function clienteDe(injetado?: ClienteEvolution): ClienteEvolution {
  const cliente = injetado ?? clienteEvolutionPadrao();
  if (!cliente) {
    throw new ErroAplicacao("A Evolution não está configurada neste servidor.", 503, "evolution_indisponivel");
  }
  return cliente;
}

function traduzir(erro: unknown): never {
  if (erro instanceof ErroAplicacao) throw erro;
  if (erro instanceof ErroEvolution) {
    throw new ErroAplicacao(erro.message.slice(0, 180), erro.status >= 400 && erro.status < 500 ? 400 : 502, "evolution");
  }
  throw new ErroAplicacao("Falha ao falar com a Evolution.", 502, "evolution");
}

async function reservar(chave: string, limite: number) {
  await exigirFolga(chave, limite, JANELA_MS);
  await registrarTentativa(chave);
}

export async function obterCanalDaEmpresa(empresaId: string): Promise<CanalWhatsappDTO> {
  const flag = evolutionLigada();
  const [linha, alertas] = await Promise.all([
    prisma.configuracaoCanalWhatsapp.findUnique({ where: { empresaId } }),
    listarAlertasDaEmpresa(empresaId),
  ]);
  if (!linha) return { ...canalVazio(flag), alertas };
  return {
    evolutionHabilitada: flag,
    provedor: provedorDe(linha.provedor),
    status: linha.instanceName ? statusDe(linha.statusConexao) : "AUSENTE",
    telefone: telefoneExibicao(linha.telefone),
    erro: linha.erro,
    qrCode: null,
    alertas,
  };
}

export async function escolherProvedorWhatsapp(autor: AutorEmpresa, entrada: unknown): Promise<CanalWhatsappDTO> {
  exigirRegua(autor);
  const dados = lerEsquema(esquemaProvedorWhatsapp, entrada);
  if (dados.provedor === "EVOLUTION") exigirFlag();
  await reservar(`evo:provedor:${autor.empresaId}`, LIMITE_PROVEDOR);
  await prisma.configuracaoCanalWhatsapp.upsert({
    where: { empresaId: autor.empresaId },
    create: { empresaId: autor.empresaId, provedor: dados.provedor },
    update: { provedor: dados.provedor },
  });
  return obterCanalDaEmpresa(autor.empresaId);
}

async function gravarEstado(
  empresaId: string,
  dados: { statusConexao: EstadoEvolution; telefone?: string | null; erro?: string | null; instanceName?: string },
) {
  await prisma.configuracaoCanalWhatsapp.update({
    where: { empresaId },
    data: {
      statusConexao: dados.statusConexao,
      ...(dados.telefone !== undefined ? { telefone: dados.telefone } : {}),
      erro: dados.erro ?? null,
      ...(dados.instanceName ? { instanceName: dados.instanceName } : {}),
    },
  });
  if (dados.statusConexao === "CONECTADO") await resolverAlerta(empresaId, "WHATSAPP_DESCONECTADO");
  if (dados.statusConexao === "DESCONECTADO" || dados.statusConexao === "ERRO") {
    await abrirAlerta(empresaId, "WHATSAPP_DESCONECTADO");
  }
}

export async function conectarEvolution(
  autor: AutorEmpresa,
  opcoes: { evolution?: ClienteEvolution } = {},
): Promise<CanalWhatsappDTO> {
  exigirRegua(autor);
  exigirFlag();
  await reservar(`evo:conexao:${autor.empresaId}`, LIMITE_CONEXAO);
  const cliente = clienteDe(opcoes.evolution);
  const nome = nomeInstanciaDaEmpresa(autor.empresaId);
  let webhook = "";
  let segredo = "";
  try {
    webhook = urlWebhookEvolution();
    segredo = segredoWebhookEvolution();
  } catch (erro) {
    traduzir(erro);
  }
  await prisma.configuracaoCanalWhatsapp.upsert({
    where: { empresaId: autor.empresaId },
    create: {
      empresaId: autor.empresaId,
      provedor: "EVOLUTION",
      instanceName: nome,
      statusConexao: "CONECTANDO",
    },
    update: { provedor: "EVOLUTION", instanceName: nome, statusConexao: "CONECTANDO", erro: null },
  });
  let qr = null;
  try {
    qr = await cliente.garantirInstancia(nome, webhook, segredo);
    const extra = qr ? null : await cliente.conectar(nome);
    qr = qr ?? extra;
  } catch (erro) {
    await gravarEstado(autor.empresaId, { statusConexao: "ERRO", erro: "Não foi possível iniciar o QR Code." });
    traduzir(erro);
  }
  const imagem = qrConfiavel(qr?.imagem);
  const canal = await obterCanalDaEmpresa(autor.empresaId);
  return { ...canal, status: "CONECTANDO", qrCode: imagem };
}

export async function reconectarEvolution(
  autor: AutorEmpresa,
  opcoes: { evolution?: ClienteEvolution } = {},
): Promise<CanalWhatsappDTO> {
  exigirRegua(autor);
  exigirFlag();
  await reservar(`evo:conexao:${autor.empresaId}`, LIMITE_CONEXAO);
  const linha = await prisma.configuracaoCanalWhatsapp.findUnique({ where: { empresaId: autor.empresaId } });
  if (!linha?.instanceName) {
    throw new ErroAplicacao("Ainda não há uma conexão para retomar. Gere o QR Code.", 400, "evolution_ausente");
  }
  const cliente = clienteDe(opcoes.evolution);
  let qr = null;
  try {
    qr = await cliente.conectar(linha.instanceName);
  } catch (erro) {
    await gravarEstado(autor.empresaId, { statusConexao: "ERRO", erro: "Não foi possível reconectar." });
    traduzir(erro);
  }
  await prisma.configuracaoCanalWhatsapp.update({
    where: { empresaId: autor.empresaId },
    data: { provedor: "EVOLUTION", statusConexao: "CONECTANDO", erro: null },
  });
  const canal = await obterCanalDaEmpresa(autor.empresaId);
  return { ...canal, status: "CONECTANDO", qrCode: qrConfiavel(qr?.imagem) };
}

export async function desconectarEvolution(
  autor: AutorEmpresa,
  opcoes: { evolution?: ClienteEvolution } = {},
): Promise<CanalWhatsappDTO> {
  exigirRegua(autor);
  exigirFlag();
  await reservar(`evo:conexao:${autor.empresaId}`, LIMITE_CONEXAO);
  const linha = await prisma.configuracaoCanalWhatsapp.findUnique({ where: { empresaId: autor.empresaId } });
  if (linha?.instanceName) {
    const cliente = clienteDe(opcoes.evolution);
    try {
      await cliente.desconectar(linha.instanceName);
    } catch (erro) {
      traduzir(erro);
    }
  }
  if (linha) await gravarEstado(autor.empresaId, { statusConexao: "DESCONECTADO" });
  return obterCanalDaEmpresa(autor.empresaId);
}

export async function atualizarStatusEvolution(
  autor: AutorEmpresa,
  opcoes: { evolution?: ClienteEvolution } = {},
): Promise<CanalWhatsappDTO> {
  exigirRegua(autor);
  exigirFlag();
  await reservar(`evo:status:${autor.empresaId}`, LIMITE_STATUS);
  const linha = await prisma.configuracaoCanalWhatsapp.findUnique({ where: { empresaId: autor.empresaId } });
  if (!linha?.instanceName) return obterCanalDaEmpresa(autor.empresaId);
  const cliente = clienteDe(opcoes.evolution);
  try {
    const estado = await cliente.estado(linha.instanceName);
    await gravarEstado(autor.empresaId, { statusConexao: estado });
  } catch (erro) {
    await gravarEstado(autor.empresaId, { statusConexao: "ERRO", erro: "Não foi possível consultar a conexão." });
    traduzir(erro);
  }
  return obterCanalDaEmpresa(autor.empresaId);
}

export async function marcarAlertaWhatsappLido(autor: AutorEmpresa, entrada: unknown): Promise<CanalWhatsappDTO> {
  exigirVerRegua(autor);
  const dados = lerEsquema(esquemaAlertaWhatsapp, entrada);
  await prisma.alertaEmpresa.updateMany({
    where: { empresaId: autor.empresaId, codigo: dados.codigo as CodigoAlerta },
    data: { lido: true },
  });
  return obterCanalDaEmpresa(autor.empresaId);
}
