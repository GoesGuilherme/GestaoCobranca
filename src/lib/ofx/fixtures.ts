// Extratos sintéticos. Nomes, contas e documentos são fictícios.

export type LinhaOfx = {
  tipo?: string;
  data: string;
  valor: string;
  fitId?: string;
  memo?: string;
  nome?: string;
};

function blocoTransacao(linha: LinhaOfx): string {
  return [
    "<STMTTRN>",
    `<TRNTYPE>${linha.tipo ?? "CREDIT"}`,
    `<DTPOSTED>${linha.data}`,
    `<TRNAMT>${linha.valor}`,
    linha.fitId ? `<FITID>${linha.fitId}` : "",
    linha.nome ? `<NAME>${linha.nome}` : "",
    linha.memo ? `<MEMO>${linha.memo}` : "",
    "</STMTTRN>",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ofxSgml(dados: {
  org: string;
  fid: string;
  bankId: string;
  acctId: string;
  charset?: string;
  encoding?: string;
  linhas: LinhaOfx[];
}): string {
  return [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    `ENCODING:${dados.encoding ?? "USASCII"}`,
    `CHARSET:${dados.charset ?? "1252"}`,
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<SIGNONMSGSRSV1>",
    "<SONRS>",
    "<STATUS>",
    "<CODE>0",
    "<SEVERITY>INFO",
    "</STATUS>",
    "<DTSERVER>20261113120000",
    "<LANGUAGE>POR",
    "<FI>",
    `<ORG>${dados.org}`,
    `<FID>${dados.fid}`,
    "</FI>",
    "</SONRS>",
    "</SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1>",
    "<STMTTRNRS>",
    "<TRNUID>1001",
    "<STATUS>",
    "<CODE>0",
    "<SEVERITY>INFO",
    "</STATUS>",
    "<STMTRS>",
    "<CURDEF>BRL",
    "<BANKACCTFROM>",
    `<BANKID>${dados.bankId}`,
    `<ACCTID>${dados.acctId}`,
    "<ACCTTYPE>CHECKING",
    "</BANKACCTFROM>",
    "<BANKTRANLIST>",
    "<DTSTART>20261101000000",
    "<DTEND>20261113000000",
    ...dados.linhas.map(blocoTransacao),
    "</BANKTRANLIST>",
    "<LEDGERBAL>",
    "<BALAMT>1000.00",
    "<DTASOF>20261113120000",
    "</LEDGERBAL>",
    "</STMTRS>",
    "</STMTTRNRS>",
    "</BANKMSGSRSV1>",
    "</OFX>",
    "",
  ].join("\n");
}

function blocoXml(linha: LinhaOfx): string {
  return [
    "<STMTTRN>",
    `<TRNTYPE>${linha.tipo ?? "CREDIT"}</TRNTYPE>`,
    `<DTPOSTED>${linha.data}</DTPOSTED>`,
    `<TRNAMT>${linha.valor}</TRNAMT>`,
    linha.fitId ? `<FITID>${linha.fitId}</FITID>` : "",
    linha.nome ? `<NAME>${linha.nome}</NAME>` : "",
    linha.memo ? `<MEMO>${linha.memo}</MEMO>` : "",
    "</STMTTRN>",
  ]
    .filter(Boolean)
    .join("");
}

export function ofxXml(dados: {
  bankId: string;
  acctId: string;
  linhas: LinhaOfx[];
  moeda?: string;
}): string {
  const transacoes = dados.linhas.map(blocoXml).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1</TRNUID>
<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
<STMTRS>
<CURDEF>${dados.moeda ?? "BRL"}</CURDEF>
<BANKACCTFROM>
<BANKID>${dados.bankId}</BANKID>
<ACCTID>${dados.acctId}</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261101</DTSTART>
<DTEND>20261113</DTEND>
${transacoes}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}
