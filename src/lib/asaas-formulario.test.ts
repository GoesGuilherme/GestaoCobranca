import { describe, expect, it } from "vitest";
import { salvarAsaasHabilitado, type AsaasGravado } from "./asaas-formulario";

const CHAVE_FICTICIA = "x".repeat(24);

const novo: AsaasGravado = { ambiente: "SANDBOX", configurado: false };
const gravado: AsaasGravado = { ambiente: "SANDBOX", configurado: true };

describe("botão Salvar do Asaas", () => {
  it("começa desligado e só liga com alteração válida", () => {
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: "" }, novo)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "PRODUCAO", chaveApi: "" }, novo)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: "   " }, novo)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: "curta" }, novo)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: `${CHAVE_FICTICIA} com espaço` }, novo)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: CHAVE_FICTICIA }, novo)).toBe(true);
    expect(salvarAsaasHabilitado({ ambiente: "PRODUCAO", chaveApi: `  ${CHAVE_FICTICIA}  ` }, novo)).toBe(true);
  });

  it("numa conta já gravada, ambiente ou chave nova ligam o botão e o estado salvo desliga", () => {
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: "" }, gravado)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: "   " }, gravado)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "PRODUCAO", chaveApi: "" }, gravado)).toBe(true);
    expect(salvarAsaasHabilitado({ ambiente: "SANDBOX", chaveApi: CHAVE_FICTICIA }, gravado)).toBe(true);
    expect(salvarAsaasHabilitado({ ambiente: "PRODUCAO", chaveApi: "curta" }, gravado)).toBe(false);
    expect(salvarAsaasHabilitado({ ambiente: "PRODUCAO", chaveApi: "" }, { ambiente: "PRODUCAO", configurado: true })).toBe(
      false,
    );
  });
});
