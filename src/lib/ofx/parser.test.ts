import { describe, expect, it } from "vitest";
import { LIMITE_OFX_BYTES, analisarOfx } from "./parser";
import { ofxSgml, ofxXml } from "./fixtures";

const credito = {
  data: "20261110",
  valor: "150.00",
  fitId: "FIT-20261110-001",
  memo: "PIX RECEBIDO",
  nome: "Padaria Exemplo",
};

const debito = {
  tipo: "DEBIT",
  data: "20261111",
  valor: "-20.00",
  fitId: "FIT-TARIFA",
  memo: "TARIFA",
};

describe("parser OFX", () => {
  it("lê SGML dos bancos brasileiros e ignora débito", () => {
    const bancos = [
      { org: "ITAU", fid: "341", bankId: "0341", acctId: "12345-6", esperadoBanco: "341", esperadoConta: "123456" },
      { org: "BRADESCO", fid: "237", bankId: "237", acctId: "99887", esperadoBanco: "237", esperadoConta: "99887" },
      { org: "BANCO DO BRASIL", fid: "001", bankId: "001", acctId: "44556", esperadoBanco: "001", esperadoConta: "44556" },
      { org: "CAIXA", fid: "104", bankId: "104", acctId: "77889", esperadoBanco: "104", esperadoConta: "77889" },
      { org: "SANTANDER", fid: "033", bankId: "033", acctId: "33221", esperadoBanco: "033", esperadoConta: "33221" },
      { org: "NUBANK", fid: "260", bankId: "260", acctId: "100200", esperadoBanco: "260", esperadoConta: "100200" },
      { org: "SICOOB", fid: "756", bankId: "756", acctId: "55667", esperadoBanco: "756", esperadoConta: "55667" },
      { org: "SICREDI", fid: "748", bankId: "748", acctId: "88990", esperadoBanco: "748", esperadoConta: "88990" },
    ];

    for (const banco of bancos) {
      const texto = ofxSgml({ ...banco, linhas: [credito, debito] });
      const extrato = analisarOfx(Buffer.from(texto, "latin1"));
      expect(extrato.formato, banco.org).toBe("sgml");
      expect(extrato.bankId, banco.org).toBe(banco.esperadoBanco);
      expect(extrato.acctId, banco.org).toBe(banco.esperadoConta);
      expect(extrato.creditos, banco.org).toHaveLength(1);
      expect(extrato.creditos[0]).toMatchObject({ valor: "150.00", data: "2026-11-10", fitId: "FIT-20261110-001" });
      expect(extrato.debitosIgnorados, banco.org).toBe(1);
    }
  });

  it("aceita decimal com vírgula no Bradesco e data com fuso no Santander", () => {
    const bradesco = analisarOfx(
      Buffer.from(
        ofxSgml({
          org: "BRADESCO",
          fid: "237",
          bankId: "237",
          acctId: "1",
          linhas: [{ data: "20261110120000[-3:BRT]", valor: "1.250,50", fitId: "B1", memo: "PIX" }],
        }),
        "latin1",
      ),
    );
    expect(bradesco.creditos[0]).toMatchObject({ valor: "1250.50", data: "2026-11-10" });
  });

  it("decodifica latin1 e XML utf-8", () => {
    const sgml = ofxSgml({
      org: "ITAU",
      fid: "341",
      bankId: "341",
      acctId: "10",
      linhas: [{ data: "20261110", valor: "10.00", fitId: "L1", nome: "Jos\u00e9 da Silva" }],
    });
    const latin = analisarOfx(Buffer.from(sgml, "latin1"));
    expect(latin.creditos[0]?.nome).toBe("Jos\u00e9 da Silva");

    const xml = analisarOfx(
      Buffer.from(
        ofxXml({
          bankId: "077",
          acctId: "300400",
          linhas: [{ data: "20261112", valor: "80.00", fitId: "I1", nome: "S\u00e3o Paulo Cafe" }],
        }),
        "utf8",
      ),
    );
    expect(xml.formato).toBe("xml");
    expect(xml.bankId).toBe("077");
    expect(xml.creditos[0]?.nome).toBe("S\u00e3o Paulo Cafe");

    const cora = analisarOfx(
      Buffer.from(
        ofxXml({
          bankId: "403",
          acctId: "900",
          linhas: [{ data: "20261109", valor: "40.00", fitId: "C1", memo: "Pix Cora" }],
        }),
        "utf8",
      ),
    );
    expect(cora.bankId).toBe("403");
    expect(cora.creditos).toHaveLength(1);
  });

  it("recusa o que não é extrato OFX", () => {
    expect(() => analisarOfx(Buffer.from("oi"))).toThrow(/não é um OFX/);
    expect(() => analisarOfx(Buffer.from("<html><body>banco</body></html>"))).toThrow(/não é um OFX/);
    expect(() =>
      analisarOfx(Buffer.from("<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</STATUS></SONRS></SIGNONMSGSRSV1></OFX>")),
    ).toThrow(/extrato bancário/);
    expect(() =>
      analisarOfx(
        Buffer.from(
          ofxSgml({ org: "ITAU", fid: "341", bankId: "341", acctId: "", linhas: [credito] }).replace("<ACCTID>", "<ACCTID> "),
        ),
      ),
    ).toThrow(/ACCTID/);
    expect(() => analisarOfx(new Uint8Array(LIMITE_OFX_BYTES + 1))).toThrow(/2 MB/);
  });

  it("ignora valor zero e mantém o FITID estável quando o banco não manda", () => {
    const linhas = [
      { data: "20261110", valor: "0.00", fitId: "Z0", memo: "zero" },
      { data: "20261110", valor: "15.00", memo: "sem id", nome: "Ana" },
      { data: "20261110", valor: "-5", fitId: "D1", memo: "saida" },
    ];
    const bytes = Buffer.from(ofxSgml({ org: "CAIXA", fid: "104", bankId: "104", acctId: "55", linhas }));
    const primeira = analisarOfx(bytes);
    const segunda = analisarOfx(bytes);
    expect(primeira.creditos).toHaveLength(1);
    expect(primeira.creditos[0]?.fitId).toMatch(/^ofx-[a-f0-9]{32}$/);
    expect(segunda.creditos[0]?.fitId).toBe(primeira.creditos[0]?.fitId);
    expect(primeira.debitosIgnorados).toBe(1);
  });

  it("não duplica o mesmo FITID e separa o FITID repetido com outro valor", () => {
    const extrato = analisarOfx(
      Buffer.from(
        ofxSgml({
          org: "NUBANK",
          fid: "260",
          bankId: "260",
          acctId: "1",
          linhas: [
            { data: "20261110", valor: "10.00", fitId: "MESMO", memo: "um" },
            { data: "20261110", valor: "10.00", fitId: "MESMO", memo: "um" },
            { data: "20261111", valor: "12.00", fitId: "MESMO", memo: "dois" },
          ],
        }),
      ),
    );
    expect(extrato.creditos.map((item) => item.valor)).toEqual(["10.00", "12.00"]);
    expect(new Set(extrato.creditos.map((item) => item.fitId)).size).toBe(2);
  });
});
