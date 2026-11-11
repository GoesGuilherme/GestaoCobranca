import { describe, expect, it } from "vitest";
import {
  LIMITE_LOGO_BYTES,
  MENSAGEM_LOGO_TAMANHO,
  MENSAGEM_LOGO_TIPO,
  MENSAGEM_LOGO_VAZIA,
  dataUrlLogo,
  origemDosEmails,
  urlPublicaLogo,
  validarLogo,
} from "./logo";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("validação da logo", () => {
  it("aceita png e jpeg pela assinatura do arquivo", () => {
    expect(validarLogo(PNG)).toEqual({ ok: true, mime: "image/png" });
    expect(validarLogo(JPEG)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(dataUrlLogo("image/png", PNG)).toMatch(/^data:image\/png;base64,/);
  });

  it("recusa svg, html, gif, arquivo vazio e arquivo grande", () => {
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`);
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const gif = new TextEncoder().encode("GIF89a");
    const grande = new Uint8Array(LIMITE_LOGO_BYTES + 1);
    grande.set(PNG);

    expect(validarLogo(svg)).toEqual({ ok: false, erro: MENSAGEM_LOGO_TIPO });
    expect(validarLogo(html)).toEqual({ ok: false, erro: MENSAGEM_LOGO_TIPO });
    expect(validarLogo(gif)).toEqual({ ok: false, erro: MENSAGEM_LOGO_TIPO });
    expect(validarLogo(new Uint8Array())).toEqual({ ok: false, erro: MENSAGEM_LOGO_VAZIA });
    expect(validarLogo(grande)).toEqual({ ok: false, erro: MENSAGEM_LOGO_TAMANHO });
  });

  it("monta a url pública só em https e só para o id da empresa", () => {
    const id = "c123456789012345678901234";
    expect(urlPublicaLogo(id, "2026-11-11T00:00:00.000Z", {})).toBeNull();
    expect(origemDosEmails({ PAGAMENTOS_PUBLIC_URL: "http://inseguro.test" })).toBeNull();
    expect(urlPublicaLogo(id, "2026-11-11T00:00:00.000Z", { PAGAMENTOS_PUBLIC_URL: "https://app.exemplo.test/" })).toBe(
      "https://app.exemplo.test/api/publico/logos/c123456789012345678901234?v=2026-11-11T00%3A00%3A00.000Z",
    );
    expect(urlPublicaLogo("../outra", "1", { VERCEL_PROJECT_PRODUCTION_URL: "taguaro.exemplo.test" })).toBeNull();
    expect(urlPublicaLogo("collab_software", "2026-11-11T00:00:00.000Z", { PAGAMENTOS_PUBLIC_URL: "https://app.exemplo.test" })).toBe(
      "https://app.exemplo.test/api/publico/logos/collab_software?v=2026-11-11T00%3A00%3A00.000Z",
    );
    expect(origemDosEmails({ VERCEL_URL: "gestao-cobranca-beta.vercel.app" })).toBe(
      "https://gestao-cobranca-beta.vercel.app",
    );
  });
});
