import { cnpjValido, somenteDigitos, somenteDocumento, whatsappValido } from "./documento";
import { ufValida } from "./ufs";

export const TEXTO_CONSULTANDO_CNPJ = "Consultando CNPJ…";
export const MENSAGEM_CNPJ_INVALIDO = "CNPJ inválido. Confira os dígitos.";
export const MENSAGEM_CNPJ_NAO_ENCONTRADO =
  "Não encontramos este CNPJ. Confira o número ou preencha os dados manualmente.";
export const MENSAGEM_CNPJ_INAPTA =
  "Este CNPJ está inapto na Receita Federal. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_BAIXADA =
  "Este CNPJ está baixado na Receita Federal. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_SUSPENSA =
  "Este CNPJ está suspenso na Receita Federal. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_NULA =
  "Este CNPJ está com cadastro nulo na Receita Federal. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_FALHA =
  "Não foi possível consultar o CNPJ agora. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_OCUPADA =
  "Muitas consultas de CNPJ em seguida. Aguarde um instante e tente de novo. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_SEM_DADOS =
  "A consulta não trouxe os dados deste CNPJ. Os dados que você já digitou foram mantidos.";
export const MENSAGEM_CNPJ_SUCESSO = "Dados do CNPJ preenchidos. Você pode corrigir qualquer campo.";
export const MENSAGEM_CNPJ_INFORME = "Informe um CNPJ válido.";

const LIMITE = {
  razaoSocial: 160,
  nomeFantasia: 120,
  endereco: 200,
  numero: 20,
  complemento: 80,
  bairro: 80,
  cidade: 80,
  email: 160,
  telefone: 20,
} as const;

const PALAVRAS_MENORES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "para",
  "pelo",
  "pela",
  "pelos",
  "pelas",
]);

export type CamposCadastroCnpj = {
  razaoSocial?: string;
  nomeFantasia?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
  email?: string;
  telefone?: string;
};

export type CamposClienteCnpj = {
  nomeFantasia?: string;
  razaoSocial?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
  email?: string;
};

export type CamposEmpresaCnpj = {
  nomeFantasia?: string;
  razaoSocial?: string;
  emailContato?: string;
  telefone?: string;
};

export type ResultadoConsultaCnpj =
  | { ok: true; campos: CamposCadastroCnpj; mensagem: string }
  | { ok: false; mensagem: string; codigo: string; status: number };

export type DecisaoConsultaCnpj =
  | { acao: "aguardar" }
  | { acao: "recusar"; mensagem: string; codigo: "cnpj_invalido" }
  | { acao: "consultar"; cnpj: string };

export type EstadoConsultaCnpj =
  | { fase: "ocioso" }
  | { fase: "carregando" }
  | { fase: "sucesso"; texto: string }
  | { fase: "erro"; texto: string };

export const CONSULTA_OCIOSA: EstadoConsultaCnpj = { fase: "ocioso" };

export type MemoriaConsulta = {
  inicial: string | null;
  liberado: boolean;
  consultado: string | null;
};

export type PassoConsulta =
  | { tipo: "ocioso" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "repetir" }
  | { tipo: "buscar"; cnpj: string };

export const MEMORIA_CONSULTA: MemoriaConsulta = { inicial: null, liberado: false, consultado: null };

// O valor que já está na tela (edição ou placeholder) não dispara a consulta.
// Depois que a pessoa altera o campo, outro CNPJ válido consulta de novo.
export function passoConsulta(memoria: MemoriaConsulta, documento: string): { memoria: MemoriaConsulta; passo: PassoConsulta } {
  const proxima: MemoriaConsulta = { ...memoria };
  if (proxima.inicial === null) proxima.inicial = documento;
  if (!proxima.liberado) {
    if (documento === proxima.inicial) return { memoria: proxima, passo: { tipo: "ocioso" } };
    proxima.liberado = true;
  }

  const decisao = decidirConsultaCnpj(documento);
  if (decisao.acao === "aguardar") return { memoria: proxima, passo: { tipo: "ocioso" } };
  if (decisao.acao === "recusar") return { memoria: proxima, passo: { tipo: "erro", mensagem: decisao.mensagem } };
  if (proxima.consultado === decisao.cnpj) return { memoria: proxima, passo: { tipo: "repetir" } };
  return { memoria: proxima, passo: { tipo: "buscar", cnpj: decisao.cnpj } };
}

export function decidirConsultaCnpj(valor: string): DecisaoConsultaCnpj {
  const limpo = somenteDocumento(valor).slice(0, 14);
  if (limpo.length < 14) return { acao: "aguardar" };
  if (!cnpjValido(limpo)) {
    return { acao: "recusar", mensagem: MENSAGEM_CNPJ_INVALIDO, codigo: "cnpj_invalido" };
  }
  return { acao: "consultar", cnpj: limpo };
}

export function tituloCadastro(valor: string): string {
  return valor
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((palavra, indice) => {
      if (!palavra) return palavra;
      if (indice > 0 && PALAVRAS_MENORES.has(palavra)) return palavra;
      return palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1);
    })
    .join(" ");
}

export function mapearRespostaBrasilApi(corpo: unknown): ResultadoConsultaCnpj {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return falha(MENSAGEM_CNPJ_SEM_DADOS, "cnpj_sem_dados", 502);
  }
  const dados = corpo as Record<string, unknown>;
  const situacao = situacaoCadastral(dados);
  if (situacao === "inapta") return falha(MENSAGEM_CNPJ_INAPTA, "cnpj_inapta", 422);
  if (situacao === "baixada") return falha(MENSAGEM_CNPJ_BAIXADA, "cnpj_baixada", 422);
  if (situacao === "suspensa") return falha(MENSAGEM_CNPJ_SUSPENSA, "cnpj_suspensa", 422);
  if (situacao === "nula") return falha(MENSAGEM_CNPJ_NULA, "cnpj_nula", 422);

  const campos = montarCampos(dados);
  if (!campos.razaoSocial) return falha(MENSAGEM_CNPJ_SEM_DADOS, "cnpj_sem_dados", 502);
  return { ok: true, campos, mensagem: MENSAGEM_CNPJ_SUCESSO };
}

export function camposDoCliente(campos: CamposCadastroCnpj): CamposClienteCnpj {
  return {
    nomeFantasia: campos.nomeFantasia,
    razaoSocial: campos.razaoSocial,
    endereco: campos.endereco,
    numero: campos.numero,
    complemento: campos.complemento,
    bairro: campos.bairro,
    cep: campos.cep,
    cidade: campos.cidade,
    uf: campos.uf,
    email: campos.email,
  };
}

export function camposDaEmpresa(campos: CamposCadastroCnpj): CamposEmpresaCnpj {
  return {
    nomeFantasia: campos.nomeFantasia,
    razaoSocial: campos.razaoSocial,
    emailContato: campos.email,
    telefone: campos.telefone,
  };
}

export function mesclarCadastro<T extends Record<string, string>>(
  atual: T,
  vindos: Partial<Record<keyof T, string | undefined>>,
): T {
  return aplicarConsulta(atual, null, vindos).valores;
}

// A primeira consulta só preenche o que veio. Na seguinte, o campo que a consulta
// anterior tinha preenchido e a nova não traz é limpo — a menos que a pessoa tenha editado.
export function aplicarConsulta<T extends Record<string, string>>(
  atual: T,
  anteriores: Partial<Record<keyof T, string>> | null,
  recebidos: Partial<Record<keyof T, string | undefined>>,
): { valores: T; aplicados: Partial<Record<keyof T, string>> } {
  const proximo = { ...atual };
  const aplicados: Partial<Record<keyof T, string>> = {};
  const chaves = new Set<keyof T>([
    ...(Object.keys(anteriores ?? {}) as (keyof T)[]),
    ...(Object.keys(recebidos) as (keyof T)[]),
  ]);

  for (const chave of chaves) {
    const bruto = recebidos[chave];
    const novo = typeof bruto === "string" ? bruto.trim() : "";
    if (novo) {
      proximo[chave] = novo as T[keyof T];
      aplicados[chave] = novo;
      continue;
    }
    const velho = anteriores?.[chave];
    if (velho && atual[chave] === velho) proximo[chave] = "" as T[keyof T];
  }

  return { valores: proximo, aplicados };
}

export function lerCamposCadastro(valor: unknown): CamposCadastroCnpj | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const origem = valor as Record<string, unknown>;
  const campos: CamposCadastroCnpj = {};
  atribuir(campos, "razaoSocial", origem.razaoSocial, LIMITE.razaoSocial);
  atribuir(campos, "nomeFantasia", origem.nomeFantasia, LIMITE.nomeFantasia);
  atribuir(campos, "endereco", origem.endereco, LIMITE.endereco);
  atribuir(campos, "numero", origem.numero, LIMITE.numero);
  atribuir(campos, "complemento", origem.complemento, LIMITE.complemento);
  atribuir(campos, "bairro", origem.bairro, LIMITE.bairro);
  const cep = cepConsulta(origem.cep);
  if (cep) campos.cep = cep;
  atribuir(campos, "cidade", origem.cidade, LIMITE.cidade);
  if (typeof origem.uf === "string" && ufValida(origem.uf)) campos.uf = origem.uf.trim().toUpperCase();
  const email = emailConsulta(origem.email);
  if (email) campos.email = email;
  const telefone = telefoneConsulta(origem.telefone);
  if (telefone) campos.telefone = telefone;
  return campos.razaoSocial ? campos : null;
}

const VAZAMENTO = /postgres(?:ql)?:\/\/|node_modules|\/var\/|ECONN|EAI_AGAIN|getaddrinfo|\bat\s+\S+\s+\(/i;

export function mensagemVisivelConsulta(valor: unknown): string {
  if (typeof valor !== "string") return MENSAGEM_CNPJ_FALHA;
  const texto = valor.replace(/\s+/g, " ").trim();
  if (!texto || texto.length > 280 || VAZAMENTO.test(texto)) return MENSAGEM_CNPJ_FALHA;
  return texto;
}

function falha(mensagem: string, codigo: string, status: number): ResultadoConsultaCnpj {
  return { ok: false, mensagem, codigo, status };
}

function situacaoCadastral(
  dados: Record<string, unknown>,
): "ativa" | "inapta" | "baixada" | "suspensa" | "nula" | "desconhecida" {
  const descricao =
    typeof dados.descricao_situacao_cadastral === "string"
      ? dados.descricao_situacao_cadastral.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase()
      : "";
  if (descricao) {
    if (descricao.includes("INAPTA")) return "inapta";
    if (descricao.includes("BAIXAD")) return "baixada";
    if (descricao.includes("SUSPENS")) return "suspensa";
    if (descricao.includes("NULA")) return "nula";
    if (descricao.includes("ATIVA")) return "ativa";
    return "desconhecida";
  }
  const codigo = Number(dados.situacao_cadastral);
  if (codigo === 2) return "ativa";
  if (codigo === 4) return "inapta";
  if (codigo === 8) return "baixada";
  if (codigo === 3) return "suspensa";
  if (codigo === 1) return "nula";
  return "desconhecida";
}

function montarCampos(dados: Record<string, unknown>): CamposCadastroCnpj {
  const numero = numeroConsulta(dados.numero);
  const campos: CamposCadastroCnpj = {};
  const razao = textoCadastro(dados.razao_social, LIMITE.razaoSocial, 2);
  const fantasia = textoCadastro(dados.nome_fantasia, LIMITE.nomeFantasia, 2);
  const endereco = textoCadastro(montarLogradouro(dados.descricao_tipo_de_logradouro, dados.logradouro, numero), LIMITE.endereco, 1);
  const complemento = textoCadastro(dados.complemento, LIMITE.complemento, 1);
  const bairro = textoCadastro(dados.bairro, LIMITE.bairro, 1);
  const cidade = textoCadastro(dados.municipio, LIMITE.cidade, 2);
  const cep = cepConsulta(dados.cep);
  const email = emailConsulta(dados.email);
  const telefone = telefoneConsulta(dados.ddd_telefone_1);
  const uf = typeof dados.uf === "string" && ufValida(dados.uf) ? dados.uf.trim().toUpperCase() : undefined;
  if (razao) campos.razaoSocial = razao;
  if (fantasia) campos.nomeFantasia = fantasia;
  if (endereco) campos.endereco = endereco;
  if (numero) campos.numero = numero;
  if (complemento) campos.complemento = complemento;
  if (bairro) campos.bairro = bairro;
  if (cep) campos.cep = cep;
  if (cidade) campos.cidade = cidade;
  if (uf) campos.uf = uf;
  if (email) campos.email = email;
  if (telefone) campos.telefone = telefone;
  return campos;
}

function montarLogradouro(tipo: unknown, logradouro: unknown, numero: string | undefined): string {
  const tipoTxt = typeof tipo === "string" ? tipo.trim() : "";
  let nome = typeof logradouro === "string" ? logradouro.trim().replace(/\s+/g, " ") : "";
  if (numero && nome) {
    const escapado = numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    nome = nome.replace(new RegExp(`\\s+${escapado}$`, "i"), "").trim();
  }
  if (!nome) return tipoTxt;
  if (!tipoTxt) return nome;
  if (nome.toUpperCase().startsWith(tipoTxt.toUpperCase())) return nome;
  return `${tipoTxt} ${nome}`;
}

function textoCadastro(valor: unknown, max: number, min: number): string | undefined {
  if (typeof valor !== "string") return undefined;
  const limpo = valor.replace(/\s+/g, " ").trim();
  if (!limpo || limpo === "*" || /^[*.\-]+$/.test(limpo)) return undefined;
  const cortado = tituloCadastro(limpo).slice(0, max).trim();
  return cortado.length >= min ? cortado : undefined;
}

function numeroConsulta(valor: unknown): string | undefined {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor).slice(0, LIMITE.numero);
  if (typeof valor !== "string") return undefined;
  const limpo = valor.trim().replace(/\s+/g, " ");
  if (!limpo || limpo === "0") return undefined;
  if (/^s\/?n$/i.test(limpo)) return "S/N";
  return limpo.slice(0, LIMITE.numero);
}

function cepConsulta(valor: unknown): string | undefined {
  if (typeof valor !== "string" && typeof valor !== "number") return undefined;
  const digitos = String(valor).replace(/\D/g, "");
  if (digitos.length !== 8) return undefined;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

function emailConsulta(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const email = valor.trim().toLowerCase();
  if (email.length < 5 || email.length > LIMITE.email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  return email;
}

function telefoneConsulta(valor: unknown): string | undefined {
  if (typeof valor !== "string" && typeof valor !== "number") return undefined;
  let digitos = somenteDigitos(String(valor));
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    digitos = digitos.slice(2);
  }
  if (!whatsappValido(digitos)) return undefined;
  if (digitos.length === 11) return digitos.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  return digitos.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}

function atribuir(
  campos: CamposCadastroCnpj,
  chave: keyof CamposCadastroCnpj,
  valor: unknown,
  max: number,
) {
  if (typeof valor !== "string") return;
  const limpo = valor.trim();
  if (!limpo || limpo.length > max) return;
  campos[chave] = limpo;
}
