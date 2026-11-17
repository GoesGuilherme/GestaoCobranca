import { describe, expect, it } from "vitest";
import { ligacaoReguaAlterada, remetenteAlterado } from "./formulario-config";
import { reguaAlterada, type ReguaRascunho } from "./regua-rascunho";

const salvo = { nome: "Empresa", email: "cobranca@empresa.com", reply: "financeiro@empresa.com" };
const regua: ReguaRascunho = {
  nome: "Padrão",
  padrao: true,
  horaInicio: "8",
  horaFim: "18",
  enviarFimDeSemana: false,
  passos: [
    {
      id: "passo-1",
      naEmissao: false,
      dias: "0",
      assunto: "Sua cobrança vence hoje",
      corpo: "Olá",
      enviarWhatsapp: false,
    },
  ],
};

describe("botão salvar só com mudança", () => {
  it("o remetente muda com nome, e-mail, resposta ou chave nova", () => {
    expect(remetenteAlterado({ ...salvo, chave: "" }, salvo)).toBe(false);
    expect(remetenteAlterado({ ...salvo, chave: "   " }, salvo)).toBe(false);
    expect(remetenteAlterado({ ...salvo, nome: "Outro", chave: "" }, salvo)).toBe(true);
    expect(remetenteAlterado({ ...salvo, email: "outro@empresa.com", chave: "" }, salvo)).toBe(true);
    expect(remetenteAlterado({ ...salvo, reply: "", chave: "" }, salvo)).toBe(true);
    expect(remetenteAlterado({ ...salvo, chave: "re_chave_nova" }, salvo)).toBe(true);
  });

  it("ligar a régua e o modo teste são um cartão à parte", () => {
    const base = { ativa: true, modoTeste: false };
    expect(ligacaoReguaAlterada(base, base)).toBe(false);
    expect(ligacaoReguaAlterada({ ...base, modoTeste: true }, base)).toBe(true);
    expect(ligacaoReguaAlterada({ ...base, ativa: false }, base)).toBe(true);
  });

  it("a régua só conta como alterada quando nome, horário ou passo mudam", () => {
    expect(reguaAlterada(regua, { ...regua, passos: regua.passos.map((passo) => ({ ...passo })) })).toBe(false);
    expect(reguaAlterada({ ...regua, nome: "Outra" }, regua)).toBe(true);
    expect(reguaAlterada({ ...regua, passos: [{ ...regua.passos[0], enviarWhatsapp: true }] }, regua)).toBe(true);
  });
});
