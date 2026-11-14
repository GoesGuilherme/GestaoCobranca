import { dataIsoValida } from "@/lib/data";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { cnpjValido, cpfValido, somenteDocumento } from "@/lib/documento";

export type FaturaParaConciliar = {
  id: string;
  valor: string;
  txid: string | null;
  emissao: string;
  nomeFantasia: string;
  razaoSocial: string;
  documento: string;
};

export type CreditoConciliavel = {
  fitId: string;
  data: string;
  valor: string;
  memo: string;
  nome: string;
};

export type DecisaoConciliacao =
  | { tipo: "automatico"; faturaId: string }
  | { tipo: "sugestao"; faturaIds: string[] }
  | { tipo: "nao_identificado" };

const PALAVRAS_IGNORADAS = new Set([
  "PIX",
  "TED",
  "DOC",
  "PAG",
  "PAGTO",
  "PAGAMENTO",
  "RECEBIDO",
  "RECEBIDA",
  "TRANSFERENCIA",
  "TRANSF",
  "ENVIO",
  "DEVOLUCAO",
  "TARIFA",
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
  "LTDA",
  "ME",
  "EIRELI",
  "SA",
  "SS",
  "EI",
  "SLU",
  "BANCO",
  "AGENCIA",
  "CONTA",
  "CREDITO",
  "DEBITO",
]);

export function whereFaturasPixAbertas(empresaId: string) {
  return {
    empresaId,
    provedor: "PIX_DIRETO" as const,
    excluida: false,
    status: { in: ["EM_ABERTO", "VENCIDA"] },
  };
}

function centavos(valor: string): bigint | null {
  const normal = normalizarDinheiro(valor);
  if (!normal) return null;
  const [inteiro, frac] = normal.split(".");
  return BigInt(inteiro) * BigInt(100) + BigInt(frac);
}

export function normalizarNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function frasePresente(texto: string, frase: string): boolean {
  if (!frase) return false;
  const escapada = frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^| )${escapada}(?: |$)`).test(texto);
}

function textoDoCredito(credito: CreditoConciliavel): string {
  return `${credito.nome} ${credito.memo} ${credito.fitId}`;
}

export function contemIdentificador(credito: CreditoConciliavel, identificador: string): boolean {
  const id = identificador.trim().toLowerCase();
  if (id.length < 8) return false;
  const base = textoDoCredito(credito).toLowerCase();
  let indice = base.indexOf(id);
  while (indice >= 0) {
    const antes = indice === 0 ? "" : base[indice - 1];
    const depois = base[indice + id.length] ?? "";
    const coladoAntes = /[a-z0-9]/i.test(antes);
    const coladoDepois = /[a-z0-9]/i.test(depois);
    if (!coladoAntes && !coladoDepois) return true;
    if (id.length >= 20) return true;
    indice = base.indexOf(id, indice + 1);
  }
  return false;
}

function documentosNoTexto(texto: string): Set<string> {
  const achados = new Set<string>();
  const candidatos = texto.match(/\d[\d./-]{9,20}\d|\d{11,14}/g) ?? [];
  for (const bruto of candidatos) {
    const limpo = somenteDocumento(bruto);
    if (limpo.length === 11 && cpfValido(limpo)) achados.add(limpo);
    if (limpo.length === 14 && cnpjValido(limpo)) achados.add(limpo);
    if (limpo.length > 11) {
      for (let inicio = 0; inicio <= limpo.length - 11; inicio += 1) {
        const cpf = limpo.slice(inicio, inicio + 11);
        if (cpfValido(cpf)) achados.add(cpf);
      }
    }
    if (limpo.length > 14) {
      for (let inicio = 0; inicio <= limpo.length - 14; inicio += 1) {
        const cnpj = limpo.slice(inicio, inicio + 14);
        if (cnpjValido(cnpj)) achados.add(cnpj);
      }
    }
  }
  return achados;
}

function documentoBate(credito: CreditoConciliavel, documento: string): boolean {
  const cliente = somenteDocumento(documento);
  if (!cliente) return false;
  return documentosNoTexto(`${credito.nome} ${credito.memo}`).has(cliente);
}

function nucleoNome(valor: string): string {
  return normalizarNome(valor)
    .split(" ")
    .filter((parte) => parte.length >= 2 && !PALAVRAS_IGNORADAS.has(parte))
    .join(" ");
}

function nomeForte(credito: CreditoConciliavel, fatura: FaturaParaConciliar): boolean {
  const texto = normalizarNome(`${credito.nome} ${credito.memo}`);
  const pagador = nucleoNome(credito.nome);
  for (const bruto of [fatura.nomeFantasia, fatura.razaoSocial]) {
    const cliente = normalizarNome(bruto);
    const nucleo = nucleoNome(bruto);
    if (cliente.length < 4) continue;
    if (texto === cliente || (nucleo.length >= 8 && pagador === nucleo)) return true;
    if (cliente.length >= 8 && frasePresente(texto, cliente)) return true;
    if (nucleo.length >= 8 && frasePresente(texto, nucleo)) return true;
    if (pagador.length >= 8 && pagador.split(" ").length >= 2 && frasePresente(cliente, pagador)) return true;
  }
  return false;
}

function identidadeForte(credito: CreditoConciliavel, fatura: FaturaParaConciliar): boolean {
  if (!dataIsoValida(credito.data) || !dataIsoValida(fatura.emissao)) return false;
  if (credito.data < fatura.emissao) return false;
  return documentoBate(credito, fatura.documento) || nomeForte(credito, fatura);
}

function unicos(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function decidirCredito(credito: CreditoConciliavel, faturas: FaturaParaConciliar[]): DecisaoConciliacao {
  const valor = centavos(credito.valor);
  if (valor === null) return { tipo: "nao_identificado" };
  const mesmoValor = faturas.filter((fatura) => centavos(fatura.valor) === valor);
  const porTxid = mesmoValor.filter((fatura) => fatura.txid && contemIdentificador(credito, fatura.txid));
  const porIdentidade = mesmoValor.filter((fatura) => identidadeForte(credito, fatura));

  if (porTxid.length === 1) {
    const conflito = porIdentidade.some((fatura) => fatura.id !== porTxid[0].id);
    if (!conflito) return { tipo: "automatico", faturaId: porTxid[0].id };
    return {
      tipo: "sugestao",
      faturaIds: unicos([porTxid[0].id, ...porIdentidade.map((fatura) => fatura.id)]),
    };
  }
  if (porTxid.length > 1) return { tipo: "sugestao", faturaIds: porTxid.map((fatura) => fatura.id) };
  if (porIdentidade.length === 1 && mesmoValor.length === 1) {
    return { tipo: "automatico", faturaId: porIdentidade[0].id };
  }
  if (mesmoValor.length > 0) return { tipo: "sugestao", faturaIds: mesmoValor.map((fatura) => fatura.id) };
  return { tipo: "nao_identificado" };
}

// Primeiro reserva os matches fortes e únicos. O que sobra vira sugestão
// só com faturas que este arquivo ainda não baixou.
export function conciliarExtrato(creditos: CreditoConciliavel[], faturas: FaturaParaConciliar[]): DecisaoConciliacao[] {
  const disponiveis = new Map(faturas.map((fatura) => [fatura.id, fatura]));
  const decisoes: DecisaoConciliacao[] = creditos.map(() => ({ tipo: "nao_identificado" }));
  const pendentes: number[] = [];

  creditos.forEach((credito, indice) => {
    const previa = decidirCredito(credito, [...disponiveis.values()]);
    if (previa.tipo === "automatico") {
      disponiveis.delete(previa.faturaId);
      decisoes[indice] = previa;
      return;
    }
    pendentes.push(indice);
  });

  for (const indice of pendentes) {
    const decisao = decidirCredito(creditos[indice], [...disponiveis.values()]);
    if (decisao.tipo === "automatico") disponiveis.delete(decisao.faturaId);
    decisoes[indice] = decisao;
  }
  return decisoes;
}
