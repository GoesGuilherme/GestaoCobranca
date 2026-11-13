import { describe, expect, it } from "vitest";
import {
  alteracaoMudou,
  AVISO_ALTERACAO_CORA,
  faturaPodeSerAlterada,
  motivoFaturaNaoAlteravel,
  salvarAlteracaoHabilitado,
  textoToastAlteracao,
} from "./alteracao-fatura";

const atual = { valor: "189.90", vencimento: "2026-11-15", descricao: "Mensalidade" as string | null };

describe("alteração de fatura", () => {
  it("só libera salvar quando algum campo válido mudou", () => {
    const entrada = { valor: "189,90", vencimento: "2026-11-15", descricao: "Mensalidade" };
    expect(salvarAlteracaoHabilitado(entrada, atual)).toBe(false);
    expect(salvarAlteracaoHabilitado({ ...entrada, descricao: "  Mensalidade  " }, atual)).toBe(false);
    expect(salvarAlteracaoHabilitado({ ...entrada, descricao: "" }, { ...atual, descricao: null })).toBe(false);
    expect(salvarAlteracaoHabilitado({ ...entrada, valor: "210,00" }, atual)).toBe(true);
    expect(salvarAlteracaoHabilitado({ ...entrada, vencimento: "2026-12-20" }, atual)).toBe(true);
    expect(salvarAlteracaoHabilitado({ ...entrada, descricao: "Mensalidade revista" }, atual)).toBe(true);
    expect(salvarAlteracaoHabilitado({ ...entrada, valor: "0" }, atual)).toBe(false);
    expect(salvarAlteracaoHabilitado({ ...entrada, vencimento: "2026-02-31" }, atual)).toBe(false);
    expect(alteracaoMudou(atual, { ...atual, descricao: "Mensalidade" })).toBe(false);
  });

  it("aceita aberto e vencido de Asaas, Cora e Inter, e recusa o resto", () => {
    expect(faturaPodeSerAlterada({ status: "PENDING", excluida: false, provedor: "ASAAS" })).toBe(true);
    expect(faturaPodeSerAlterada({ status: "OVERDUE", excluida: false, provedor: "ASAAS" })).toBe(true);
    expect(faturaPodeSerAlterada({ status: "OPEN", excluida: false, provedor: "CORA" })).toBe(true);
    expect(faturaPodeSerAlterada({ status: "LATE", excluida: false, provedor: "CORA" })).toBe(true);
    expect(faturaPodeSerAlterada({ status: "A_RECEBER", excluida: false, provedor: "INTER" })).toBe(true);
    expect(faturaPodeSerAlterada({ status: "ATRASADO", excluida: false, provedor: "INTER" })).toBe(true);
    expect(faturaPodeSerAlterada({ status: "PENDING", excluida: true, provedor: "ASAAS" })).toBe(false);
    expect(faturaPodeSerAlterada({ status: "RECEIVED", excluida: false, provedor: "ASAAS" })).toBe(false);
    expect(faturaPodeSerAlterada({ status: "PAID", excluida: false, provedor: "CORA" })).toBe(false);
    expect(faturaPodeSerAlterada({ status: "PROTESTO", excluida: false, provedor: "INTER" })).toBe(false);
    expect(faturaPodeSerAlterada({ status: "PENDING", excluida: false, provedor: "EFI" })).toBe(false);
    expect(motivoFaturaNaoAlteravel({ status: "PROTESTO", excluida: false, provedor: "INTER" })).toMatch(/protesto/i);
    expect(motivoFaturaNaoAlteravel({ status: "PENDING", excluida: false, provedor: "EFI" })).toMatch(/provedor/i);
    expect(motivoFaturaNaoAlteravel({ status: "RECEIVED", excluida: false, provedor: "ASAAS" })).toMatch(/aberto ou vencida/);
    expect(AVISO_ALTERACAO_CORA).toMatch(/cancela o boleto atual/);
    expect(AVISO_ALTERACAO_CORA).toMatch(/linha digitável/);
  });

  it("resume o reenvio no texto do aviso", () => {
    const texto = textoToastAlteracao(
      {
        email: { aceitos: 1, ignorados: 0, falhas: 0, naFila: 0 },
        whatsapp: { aceitos: 0, ignorados: 1, falhas: 0, naFila: 0 },
        modoTeste: false,
      },
      true,
    );
    expect(texto).toMatch(/novo foi emitido/);
    expect(texto).toMatch(/E-mail/);
    expect(texto).toMatch(/WhatsApp/);
    expect(texto).toMatch(/ignorado/);
  });
});
