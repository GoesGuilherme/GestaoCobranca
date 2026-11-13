import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FaturaDTO } from "@/lib/tipos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/faturas",
}));

import { AVISO_ALTERACAO_CORA } from "@/lib/alteracao-fatura";
import { AcoesFatura } from "./acoes-fatura";
import { DialogoAlterarFatura } from "./dialogo-alterar-fatura";

function fatura(parcial: Partial<FaturaDTO> = {}): FaturaDTO {
  return {
    id: "fat-1",
    clienteId: "cli-1",
    nomeCliente: "Costa Verde",
    clienteServicoId: "vinc-1",
    nomeServico: "Mensalidade",
    asaasPaymentId: "pay-1",
    valor: "189.90",
    vencimento: "2026-11-15",
    pagoEm: null,
    status: "PENDING",
    provedor: "ASAAS",
    formaCobranca: "BOLETO",
    boletoUrl: "https://exemplo.test/boleto",
    linhaDigitavel: "23793",
    pixCopiaCola: null,
    faturaUrl: "https://exemplo.test/fatura",
    descricao: "Mensalidade",
    excluida: false,
    visualizada: false,
    atualizadoEm: "2026-11-01T12:00:00.000Z",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    reguaModo: "PADRAO",
    reguaId: null,
    lembretes: [],
    promessaPendente: null,
    ...parcial,
  };
}

describe("diálogo de alterar fatura", () => {
  it("começa com Salvar desabilitado e avisa quando a Cora vai reemitir", () => {
    const asaas = renderToStaticMarkup(
      createElement(DialogoAlterarFatura, { fatura: fatura(), aberto: true, onFechar: () => undefined }),
    );
    expect(asaas).toMatch(/disabled[^>]*>[\s\S]*Salvar/);
    expect(asaas).not.toContain(AVISO_ALTERACAO_CORA);

    const cora = renderToStaticMarkup(
      createElement(DialogoAlterarFatura, {
        fatura: fatura({ provedor: "CORA", status: "OPEN" }),
        aberto: true,
        onFechar: () => undefined,
      }),
    );
    expect(cora).toContain(AVISO_ALTERACAO_CORA);
    expect(cora).toMatch(/disabled[^>]*>[\s\S]*Salvar/);
  });

  it("mostra Alterar só em cobrança aberta para quem pode cobrar", () => {
    const aberta = renderToStaticMarkup(createElement(AcoesFatura, { fatura: fatura(), podeCancelar: true }));
    expect(aberta).toContain("Alterar");
    const paga = renderToStaticMarkup(
      createElement(AcoesFatura, { fatura: fatura({ status: "RECEIVED" }), podeCancelar: true }),
    );
    expect(paga).not.toContain("Alterar");
    const suporte = renderToStaticMarkup(createElement(AcoesFatura, { fatura: fatura(), podeCancelar: false }));
    expect(suporte).not.toContain("Alterar");
  });
});
