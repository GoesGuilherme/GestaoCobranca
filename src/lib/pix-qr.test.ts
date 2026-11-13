import { describe, expect, it } from "vitest";
import { montarBrCode } from "./pix-brcode";
import { pngDoBrCode, svgDoBrCode } from "./pix-qr";

describe("QR Code do Pix", () => {
  it("gera PNG e SVG do mesmo BR Code", async () => {
    const payload = montarBrCode({
      chave: "financeiro@empresa.test",
      nomeRecebedor: "Padaria",
      cidadeRecebedor: "Santos",
      valor: "10.00",
      txid: "txidqr01",
    });
    const png = await pngDoBrCode(payload);
    const svg = await svgDoBrCode(payload);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(svg).toContain("<svg");
    expect(svg.length).toBeGreaterThan(100);
  });
});
