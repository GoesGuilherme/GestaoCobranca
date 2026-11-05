import { describe, expect, it } from "vitest";
import { ESPERA_DESCONEXAO_MAX_MS, proximaEsperaDesconexao } from "./espera";

describe("espera da fila quando o WhatsApp desconecta", () => {
  it("adia com folga e desiste depois de sete dias", () => {
    const agora = new Date("2026-11-05T15:00:00.000Z");
    const recente = proximaEsperaDesconexao(agora, new Date(agora.getTime() - 10 * 60 * 1000));
    expect(recente.esgotou).toBe(false);
    expect(recente.disponivelEm.getTime() - agora.getTime()).toBe(15 * 60 * 1000);

    const tarde = proximaEsperaDesconexao(agora, new Date(agora.getTime() - 2 * 60 * 60 * 1000));
    expect(tarde.disponivelEm.getTime() - agora.getTime()).toBe(60 * 60 * 1000);

    const esgotou = proximaEsperaDesconexao(agora, new Date(agora.getTime() - ESPERA_DESCONEXAO_MAX_MS - 1));
    expect(esgotou.esgotou).toBe(true);
  });
});
