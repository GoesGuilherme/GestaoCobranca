import { describe, expect, it } from "vitest";
import {
  agruparMotivos,
  motivoForaDoReenvio,
  passoEmissaoAplicavel,
  textoAjudaReenvio,
  textoConfirmacaoReenvio,
  textoResumoReenvio,
} from "./reenvio-boleto";

const reguaPadrao = {
  id: "padrao",
  padrao: true,
  passos: [
    { id: "emissao", naEmissao: true, ordem: 0 },
    { id: "vence", naEmissao: false, ordem: 1 },
  ],
};

const boleto = {
  formaCobranca: "BOLETO",
  boletoUrl: "https://exemplo.test/boleto",
  excluida: false,
  status: "PENDING",
  provedor: "ASAAS",
  email: "cliente@exemplo.test",
  reguaModo: "PADRAO",
  reguaId: null,
};

describe("reenvio de boleto", () => {
  it("só libera boleto ou boleto com Pix em aberto, com link", () => {
    const opcoes = { modoTeste: false, reguas: [reguaPadrao] };
    expect(motivoForaDoReenvio(boleto, opcoes)).toBeNull();
    expect(motivoForaDoReenvio({ ...boleto, formaCobranca: "BOLETO_PIX" }, opcoes)).toBeNull();
    expect(motivoForaDoReenvio({ ...boleto, formaCobranca: "PIX" }, opcoes)).toBe("Sem boleto.");
    expect(motivoForaDoReenvio({ ...boleto, formaCobranca: "CREDIT_CARD" }, opcoes)).toBe("Sem boleto.");
    expect(motivoForaDoReenvio({ ...boleto, formaCobranca: "UNDEFINED" }, opcoes)).toBe("Sem boleto.");
    expect(motivoForaDoReenvio({ ...boleto, boletoUrl: "  " }, opcoes)).toBe("Sem link do boleto.");
    expect(motivoForaDoReenvio({ ...boleto, status: "RECEIVED" }, opcoes)).toBe("Cobrança não está em aberto.");
    expect(motivoForaDoReenvio({ ...boleto, excluida: true }, opcoes)).toBe("Cobrança não está em aberto.");
    expect(motivoForaDoReenvio({ ...boleto, status: "A_RECEBER", provedor: "INTER" }, opcoes)).toBeNull();
    expect(motivoForaDoReenvio({ ...boleto, status: "RECEBIDO", provedor: "INTER" }, opcoes)).toBe(
      "Cobrança não está em aberto.",
    );
  });

  it("exige o passo Na emissão da régua do cliente e o e-mail fora do modo teste", () => {
    const opcoes = { modoTeste: false, reguas: [reguaPadrao] };
    expect(motivoForaDoReenvio({ ...boleto, email: "  " }, opcoes)).toBeNull();
    expect(motivoForaDoReenvio({ ...boleto, reguaModo: "NENHUMA" }, opcoes)).toBe("Cliente sem régua.");
    expect(motivoForaDoReenvio(boleto, { modoTeste: false, reguas: [{ ...reguaPadrao, passos: [reguaPadrao.passos[1]] }] })).toBe(
      "Sem passo de emissão na régua.",
    );
    expect(passoEmissaoAplicavel({ reguaModo: "PADRAO", reguaId: null }, [reguaPadrao])?.id).toBe("emissao");
    expect(
      passoEmissaoAplicavel({ reguaModo: "ESPECIFICA", reguaId: "outra" }, [
        reguaPadrao,
        { id: "outra", padrao: false, passos: [{ id: "especifica", naEmissao: true, ordem: 0 }] },
      ])?.id,
    ).toBe("especifica");
  });

  it("o texto conta aceite, não leitura", () => {
    expect(textoAjudaReenvio(0, 0, 0)).toBe("Nenhum boleto nesta lista.");
    expect(textoAjudaReenvio(4, 0, 0)).toBe("Selecione um boleto.");
    expect(textoAjudaReenvio(80, 51, 0)).toBe("No máximo 50 por vez.");
    expect(textoConfirmacaoReenvio(2, false)).toBe(
      "Reenviar 2 boletos por e-mail e WhatsApp? Os dois canais do passo Na emissão serão tentados.",
    );
    expect(textoConfirmacaoReenvio(1, true, "dono@exemplo.test")).toContain(
      "Este envio não vai para o cliente. O e-mail vai para quem está logado (dono@exemplo.test)",
    );
    expect(textoConfirmacaoReenvio(1, true, "dono@exemplo.test")).toContain("WhatsApp");
    expect(
      textoResumoReenvio({
        email: { aceitos: 2, ignorados: 1, falhas: 0, naFila: 0 },
        whatsapp: { aceitos: 1, ignorados: 1, falhas: 0, naFila: 1 },
        modoTeste: true,
      }),
    ).toEqual([
      "E-mail: 2 aceitos para envio, 1 ignorado.",
      "WhatsApp: 1 aceito para envio, 1 na fila, 1 ignorado.",
      "Modo teste ligado. Nem o e-mail nem o WhatsApp foram para o cliente.",
    ]);
    expect(
      agruparMotivos([
        { canais: [{ canal: "EMAIL", resultado: "aceito", motivo: null }, { canal: "WHATSAPP", resultado: "ignorado", motivo: "Sem boleto." }] },
        { canais: [{ canal: "WHATSAPP", resultado: "ignorado", motivo: "Sem boleto." }] },
      ]),
    ).toEqual([{ motivo: "WhatsApp: Sem boleto.", quantidade: 2 }]);
  });
});
