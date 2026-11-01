import { describe, expect, it } from "vitest";
import {
  CLIENTE_VAZIO,
  EMPRESA_ADMIN_VAZIA,
  POLITICA_FORMULARIOS,
  SERVICO_NOVO,
  USUARIO_NOVO,
  asaasAposSalvar,
  faturaInicial,
  filialNova,
  valoresAposSalvar,
  vinculoNovo,
} from "./apos-salvar";

const preenchido = <T extends Record<string, string>>(base: T, extra: Partial<T>): T => ({ ...base, ...extra });

describe("campos depois de salvar", () => {
  it("criação zera o formulário e edição mantém o que foi salvo", () => {
    const cliente = preenchido(CLIENTE_VAZIO, { nomeFantasia: "Padaria", email: "a@b.co" });
    expect(valoresAposSalvar("criar", cliente, CLIENTE_VAZIO)).toEqual(CLIENTE_VAZIO);
    expect(valoresAposSalvar("editar", cliente, CLIENTE_VAZIO)).toEqual(cliente);

    const usuario = preenchido(USUARIO_NOVO, { nome: "Ana", email: "ana@b.co", senha: "segredo12" });
    expect(valoresAposSalvar("criar", usuario, USUARIO_NOVO)).toEqual(USUARIO_NOVO);

    const empresa = preenchido(EMPRESA_ADMIN_VAZIA, { razaoSocial: "Casa", nome: "Dono" });
    expect(valoresAposSalvar("criar", empresa, EMPRESA_ADMIN_VAZIA)).toEqual(EMPRESA_ADMIN_VAZIA);

    const servico = preenchido(SERVICO_NOVO, { nome: "Suporte", precoPadrao: "189,90" });
    expect(valoresAposSalvar("criar", servico, SERVICO_NOVO)).toEqual(SERVICO_NOVO);
    expect(valoresAposSalvar("editar", servico, SERVICO_NOVO)).toEqual(servico);

    const filialInicial = filialNova("Santos", "SP");
    const filial = preenchido(filialInicial, { nome: "Praia", cnpj: "00.000.000/0001-00" });
    expect(valoresAposSalvar("criar", filial, filialInicial)).toEqual(filialInicial);
    expect(valoresAposSalvar("editar", filial, filialInicial)).toEqual(filial);

    const faturaInicialHoje = faturaInicial("BOLETO", "2026-11-01");
    const fatura = preenchido(faturaInicialHoje, { valor: "10,00", descricao: "Mensal", vencimento: "2026-12-01", formaCobranca: "PIX" });
    expect(valoresAposSalvar("criar", fatura, faturaInicialHoje)).toEqual(faturaInicialHoje);

    const vinculoInicial = vinculoNovo({ servicoId: "s1", valor: "10,00", inicioEm: "2026-11-01" });
    const vinculo = { ...vinculoInicial, observacoes: "nota", valor: "20,00" };
    expect(valoresAposSalvar("criar", vinculo, vinculoInicial)).toEqual(vinculoInicial);
    expect(valoresAposSalvar("editar", vinculo, vinculoInicial)).toEqual(vinculo);

    const empresaSalva = { razaoSocial: "Casa", nomeFantasia: "Casa", cnpj: "00", emailContato: "a@b.co", telefone: "13" };
    expect(valoresAposSalvar("editar", empresaSalva, { ...empresaSalva, razaoSocial: "" })).toEqual(empresaSalva);

    expect(valoresAposSalvar("criar", "Régua nova", "")).toBe("");
    expect(valoresAposSalvar("editar", "Padrão", "")).toBe("Padrão");
    expect(valoresAposSalvar("criar", "123456", "")).toBe("");
    expect(valoresAposSalvar("criar", "Olá", "")).toBe("");
  });

  it("no Asaas a chave sai do campo e o ambiente salvo permanece", () => {
    expect(asaasAposSalvar("PRODUCAO")).toEqual({ ambiente: "PRODUCAO", chaveApi: "" });
  });

  it("lista quais formulários limpam e quais mantêm", () => {
    const criacao = POLITICA_FORMULARIOS.filter((item) => item.modo === "criar").map((item) => item.formulario);
    const edicao = POLITICA_FORMULARIOS.filter((item) => item.modo === "editar").map((item) => item.formulario);
    expect(criacao).toEqual([
      "Novo cliente",
      "Nova fatura",
      "Novo usuário",
      "Nova empresa (admin)",
      "Nova filial",
      "Novo serviço",
      "Vender serviço",
      "Nova régua",
      "Código do WhatsApp",
      "Resposta do assessor",
    ]);
    expect(edicao).toContain("Dados da empresa");
    expect(edicao).toContain("Preferências e templates de cobrança");
    expect(edicao).toContain("Editar cliente");
    expect(edicao).not.toContain("Novo cliente");
  });
});
