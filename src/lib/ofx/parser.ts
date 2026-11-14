import { createHash } from "node:crypto";
import { dataIsoValida } from "@/lib/data";
import { normalizarDinheiro } from "@/lib/dinheiro";
import { normalizarAcctId, normalizarBankId, normalizarFitId } from "./chave";
import { LIMITE_OFX_BYTES } from "./limite";

export { LIMITE_OFX_BYTES };

export class ErroOfx extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroOfx";
  }
}

export type CreditoOfx = {
  bankId: string;
  acctId: string;
  fitId: string;
  data: string;
  valor: string;
  memo: string;
  nome: string;
};

export type ExtratoOfx = {
  formato: "sgml" | "xml";
  bankId: string;
  acctId: string;
  moeda: string;
  creditos: CreditoOfx[];
  debitosIgnorados: number;
};

const CAMPOS_TRANSACAO = new Set([
  "TRNTYPE",
  "DTPOSTED",
  "DTUSER",
  "DTAVAIL",
  "TRNAMT",
  "FITID",
  "NAME",
  "MEMO",
  "CHECKNUM",
  "REFNUM",
  "SIC",
  "PAYEEID",
  "SRVRTID",
  "CORRECTFITID",
  "CORRECTACTION",
  "CURRENCY",
  "ORIGCURRENCY",
  "EXTDNAME",
]);

const CP1252: Record<number, string> = {
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
};

type Campo = { tag: string; valor: string };

type Rascunho = {
  bankId: string;
  acctId: string;
  trnType: string;
  dtPosted: string;
  trnAmt: string;
  fitId: string;
  memo: string;
  nome: string;
};

function utf8Valido(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function decodificar1252(bytes: Uint8Array): string {
  const partes: string[] = [];
  for (const byte of bytes) partes.push(CP1252[byte] ?? String.fromCharCode(byte));
  return partes.join("");
}

export function decodificarOfx(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Buffer.from(bytes).toString("utf16le");
  }
  const inicio = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const fatia = bytes.subarray(inicio);
  const cabeca = Buffer.from(fatia.subarray(0, Math.min(fatia.length, 800))).toString("latin1");
  const encoding = /ENCODING:([A-Z0-9_-]+)/i.exec(cabeca)?.[1]?.toUpperCase() ?? "";
  const charset = /CHARSET:([A-Z0-9_-]+)/i.exec(cabeca)?.[1]?.toUpperCase() ?? "";
  const xml = /encoding=["']([^"']+)["']/i.exec(cabeca)?.[1]?.toLowerCase() ?? "";
  const pedeUtf8 = encoding === "UTF-8" || charset === "UTF-8" || charset === "UNICODE" || xml.includes("utf-8");
  const pede1252 =
    charset === "1252" ||
    charset === "WINDOWS-1252" ||
    charset === "CP1252" ||
    charset === "ISO-8859-1" ||
    charset === "LATIN1" ||
    (encoding === "USASCII" && charset !== "UTF-8" && charset !== "");
  if (pedeUtf8) return Buffer.from(fatia).toString("utf8");
  if (pede1252) return decodificar1252(fatia);
  if (utf8Valido(fatia)) return Buffer.from(fatia).toString("utf8");
  return decodificar1252(fatia);
}

function camposDe(texto: string): Campo[] {
  const semComentario = texto.replace(/<!--[\s\S]*?-->/g, "");
  const saida: Campo[] = [];
  const re = /<([A-Za-z0-9_]+)>([^<]*)/g;
  for (const match of semComentario.matchAll(re)) {
    saida.push({ tag: match[1].toUpperCase(), valor: match[2].replace(/\s+/g, " ").trim() });
  }
  return saida;
}

function valorCredito(bruto: string): string | null {
  let limpo = bruto.trim().replace(/\s/g, "");
  if (!limpo || limpo.startsWith("-")) return null;
  if (limpo.startsWith("+")) limpo = limpo.slice(1);
  const casas = /^(.*[.,])(\d+)$/.exec(limpo);
  if (casas && casas[2].length > 2) {
    if (!/^0+$/.test(casas[2].slice(2))) return null;
    limpo = `${casas[1]}${casas[2].slice(0, 2)}`;
  }
  const normal = normalizarDinheiro(limpo);
  if (!normal || normal === "0.00") return null;
  return normal;
}

function dataOfx(bruto: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(bruto.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  return dataIsoValida(iso) ? iso : null;
}

function fitSintetico(partes: string, ordem: number): string {
  const hash = createHash("sha256").update(`${partes}|${ordem}`).digest("hex").slice(0, 32);
  return `ofx-${hash}`;
}

export function analisarOfx(bytes: Uint8Array): ExtratoOfx {
  if (bytes.byteLength === 0) throw new ErroOfx("O arquivo não é um OFX.");
  if (bytes.byteLength > LIMITE_OFX_BYTES) throw new ErroOfx("O arquivo passa de 2 MB.");
  const texto = decodificarOfx(bytes);
  if (!/<OFX[\s>]/i.test(texto)) throw new ErroOfx("O arquivo não é um OFX.");
  if (!/<BANKMSGSRSV1|<CREDITCARDMSGSRSV1|<STMTRS|<CCSTMTRS|<STMTTRN/i.test(texto)) {
    throw new ErroOfx("O arquivo não traz um extrato bancário OFX.");
  }

  const formato: ExtratoOfx["formato"] = /<\?xml|OFXHEADER="200"|VERSION="2/i.test(texto) ? "xml" : "sgml";
  let bankId = "";
  let acctId = "";
  let fid = "";
  let moeda = "BRL";
  let aberta: Rascunho | null = null;
  const brutas: Rascunho[] = [];
  let viuConta = false;

  function fechar() {
    if (!aberta) return;
    brutas.push(aberta);
    aberta = null;
  }

  for (const campo of camposDe(texto)) {
    if (campo.tag === "STMTTRN") {
      fechar();
      aberta = {
        bankId: normalizarBankId(bankId) || normalizarBankId(fid) || "000",
        acctId,
        trnType: "",
        dtPosted: "",
        trnAmt: "",
        fitId: "",
        memo: "",
        nome: "",
      };
      continue;
    }
    if (aberta && CAMPOS_TRANSACAO.has(campo.tag)) {
      if (campo.tag === "TRNTYPE") aberta.trnType = campo.valor;
      else if (campo.tag === "DTPOSTED" || (campo.tag === "DTUSER" && !aberta.dtPosted)) aberta.dtPosted = campo.valor;
      else if (campo.tag === "TRNAMT") aberta.trnAmt = campo.valor;
      else if (campo.tag === "FITID") aberta.fitId = campo.valor;
      else if (campo.tag === "MEMO") aberta.memo = [aberta.memo, campo.valor].filter(Boolean).join(" ");
      else if (campo.tag === "NAME" || campo.tag === "EXTDNAME") {
        aberta.nome = [aberta.nome, campo.valor].filter(Boolean).join(" ");
      }
      continue;
    }
    if (aberta) fechar();
    if (campo.tag === "BANKID") bankId = campo.valor;
    if (campo.tag === "ACCTID") {
      acctId = normalizarAcctId(campo.valor);
      if (acctId) viuConta = true;
    }
    if (campo.tag === "FID" && !bankId) fid = campo.valor;
    if (campo.tag === "CURDEF" && campo.valor) moeda = campo.valor.toUpperCase().slice(0, 8);
  }
  fechar();

  if (!viuConta) throw new ErroOfx("O extrato não informa a conta (ACCTID).");
  if (moeda !== "BRL") throw new ErroOfx("O extrato precisa estar em real (BRL).");

  const contaPadrao = acctId;
  const bancoPadrao = normalizarBankId(bankId) || normalizarBankId(fid) || "000";
  const creditos: CreditoOfx[] = [];
  const vistos = new Set<string>();
  let debitosIgnorados = 0;
  let semFit = 0;

  for (const item of brutas) {
    const valor = valorCredito(item.trnAmt);
    if (!valor) {
      if (item.trnAmt.trim().startsWith("-")) debitosIgnorados += 1;
      continue;
    }
    const data = dataOfx(item.dtPosted);
    if (!data) continue;
    const bank = item.bankId || bancoPadrao;
    const conta = item.acctId || contaPadrao;
    if (!conta) continue;
    let fitId = normalizarFitId(item.fitId);
    if (!fitId) {
      semFit += 1;
      fitId = fitSintetico([bank, conta, data, valor, item.memo, item.nome].join("|"), semFit);
    }
    const memo = item.memo.slice(0, 500);
    const nome = item.nome.slice(0, 160);
    const chave = `${bank}|${conta}|${fitId}`;
    if (vistos.has(chave)) {
      const igual = creditos.some(
        (credito) =>
          credito.bankId === bank &&
          credito.acctId === conta &&
          credito.fitId === fitId &&
          credito.data === data &&
          credito.valor === valor &&
          credito.memo === memo,
      );
      if (igual) continue;
      const alternativo = fitSintetico([chave, data, valor, memo, nome].join("|"), creditos.length + 1);
      if (vistos.has(`${bank}|${conta}|${alternativo}`)) continue;
      vistos.add(`${bank}|${conta}|${alternativo}`);
      creditos.push({ bankId: bank, acctId: conta, fitId: alternativo, data, valor, memo, nome });
      continue;
    }
    vistos.add(chave);
    creditos.push({ bankId: bank, acctId: conta, fitId, data, valor, memo, nome });
  }

  return {
    formato,
    bankId: bancoPadrao,
    acctId: contaPadrao,
    moeda,
    creditos,
    debitosIgnorados,
  };
}
