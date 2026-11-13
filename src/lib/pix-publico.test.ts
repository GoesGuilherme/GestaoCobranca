import { describe, expect, it } from "vitest";
import { situacaoPublicaPix } from "./pix-publico";

describe("situação pública do Pix", () => {
  it("mostra em aberto, vencida, paga e cancelada sem inventar status interno", () => {
    expect(situacaoPublicaPix("EM_ABERTO", "2026-11-20", "2026-11-13", false)).toBe("Em aberto");
    expect(situacaoPublicaPix("EM_ABERTO", "2026-11-01", "2026-11-13", false)).toBe("Vencida");
    expect(situacaoPublicaPix("VENCIDA", "2026-11-01", "2026-11-13", false)).toBe("Vencida");
    expect(situacaoPublicaPix("PAGA", "2026-11-01", "2026-11-13", false)).toBe("Paga");
    expect(situacaoPublicaPix("RECEIVED", "2026-11-01", "2026-11-13", false)).toBe("Paga");
    expect(situacaoPublicaPix("CANCELADA", "2026-11-20", "2026-11-13", false)).toBe("Cancelada");
    expect(situacaoPublicaPix("EM_ABERTO", "2026-11-20", "2026-11-13", true)).toBe("Cancelada");
  });
});
