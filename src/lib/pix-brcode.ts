// BR Code estático do Pix (EMV MPM), manual do Banco Central.
// GUI br.gov.bcb.pix, moeda 986, país BR, CRC16/CCITT-FALSE no campo 63.

const GUI = "br.gov.bcb.pix";

export function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function campoEmv(id: string, valor: string): string {
  if (!/^\d{2}$/.test(id)) throw new Error("Id EMV inválido.");
  if (valor.length > 99) throw new Error("Campo EMV longo demais.");
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

// Letras ASCII, dígitos e espaço. Acentos saem. O QR não aceita o resto.
export function textoEmv(valor: string, limite: number): string {
  const semAcento = valor.normalize("NFD").replace(/\p{M}/gu, "");
  const limpo = semAcento
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return limpo.slice(0, limite);
}

export function valorEmv(valor: string): string | null {
  if (!/^\d+\.\d{2}$/.test(valor) || valor === "0.00") return null;
  const [inteiro, centavos] = valor.split(".");
  const normal = `${String(Number(inteiro))}.${centavos}`;
  if (normal.length > 13) return null;
  return normal;
}

export function txidValido(txid: string): boolean {
  return /^[A-Za-z0-9]{1,25}$/.test(txid);
}

export type DadosBrCode = {
  chave: string;
  nomeRecebedor: string;
  cidadeRecebedor: string;
  valor: string;
  txid: string;
  descricao?: string | null;
};

export function montarBrCode(dados: DadosBrCode): string {
  const chave = dados.chave.trim();
  if (!chave || chave.length > 77) throw new Error("Chave Pix inválida para o BR Code.");
  const nome = textoEmv(dados.nomeRecebedor, 25);
  const cidade = textoEmv(dados.cidadeRecebedor, 15);
  if (!nome || !cidade) throw new Error("Nome ou cidade do recebedor não cabem no BR Code.");
  if (!txidValido(dados.txid)) throw new Error("txid do Pix inválido.");
  const valor = valorEmv(dados.valor);

  const conta = [campoEmv("00", GUI), campoEmv("01", chave)];
  const descricao = textoEmv(dados.descricao ?? "", 40);
  const mioloConta = conta.join("");
  if (descricao && mioloConta.length + campoEmv("02", descricao).length <= 99) {
    conta.push(campoEmv("02", descricao));
  }

  const campos = [
    campoEmv("00", "01"),
    campoEmv("01", "11"),
    campoEmv("26", conta.join("")),
    campoEmv("52", "0000"),
    campoEmv("53", "986"),
  ];
  if (valor) campos.push(campoEmv("54", valor));
  campos.push(campoEmv("58", "BR"), campoEmv("59", nome), campoEmv("60", cidade));
  campos.push(campoEmv("62", campoEmv("05", dados.txid)));
  const semCrc = `${campos.join("")}6304`;
  return `${semCrc}${crc16Ccitt(semCrc)}`;
}

export function brCodeValido(payload: string): boolean {
  if (!payload.startsWith("000201") || !payload.includes("br.gov.bcb.pix")) return false;
  if (!/6304[0-9A-F]{4}$/.test(payload)) return false;
  const semCrc = payload.slice(0, -4);
  return crc16Ccitt(semCrc) === payload.slice(-4);
}
