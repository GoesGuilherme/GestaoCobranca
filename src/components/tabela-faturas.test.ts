import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PassoParaRotulo } from "@/lib/regua";
import type { ReguaParaProgresso } from "@/lib/regua-progresso";
import type { FaturaDTO } from "@/lib/tipos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/faturas",
}));

import { TabelaFaturas } from "./tabela-faturas";

const REGUA: ReguaParaProgresso[] = [
  {
    id: "padrao",
    padrao: true,
    nome: "Padrão",
    passos: [
      { id: "emissao", ordem: 0, naEmissao: true, dias: null, assunto: "Boleto emitido" },
      { id: "depois", ordem: 1, naEmissao: false, dias: 3, assunto: "Três dias depois" },
    ],
  },
];

const PASSOS: PassoParaRotulo[] = [
  { naEmissao: true, dias: null, assunto: "Boleto emitido" },
  { naEmissao: false, dias: 3, assunto: "Três dias depois" },
];

function fatura(promessa: boolean): FaturaDTO {
  return {
    id: "fat-1",
    clienteId: "cli-1",
    nomeCliente: "Guilherme Goes",
    clienteServicoId: null,
    nomeServico: "Licença PDVLegal",
    asaasPaymentId: "pay-1",
    valor: "50.00",
    vencimento: "2026-11-08",
    pagoEm: null,
    status: "OVERDUE",
    provedor: "ASAAS",
    formaCobranca: "BOLETO",
    boletoUrl: null,
    linhaDigitavel: null,
    pixCopiaCola: null,
    faturaUrl: null,
    descricao: null,
    excluida: false,
    visualizada: false,
    atualizadoEm: "2026-11-08T12:00:00.000Z",
    whatsapp: "",
    email: "guilherme@exemplo.test",
    reguaModo: "PADRAO",
    reguaId: null,
    lembretes: [],
    promessaPendente: promessa
      ? {
          id: "prom-1",
          dataPrometida: "2026-11-10",
          valorPrometido: "50.00",
          canal: "WHATSAPP",
          observacao: null,
          registradaPor: "Guilherme",
          registradaEm: "2026-11-09T12:00:00.000Z",
        }
      : null,
  };
}

function textosVisiveis(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function vezes(html: string, texto: string): number {
  return textosVisiveis(html).split(texto).length - 1;
}

function cartao(opcoes: { promessa: boolean; passosCliente?: PassoParaRotulo[] | null }) {
  return renderToStaticMarkup(
    createElement(TabelaFaturas, {
      faturas: [fatura(opcoes.promessa)],
      podeCancelar: true,
      mostrarCliente: true,
      hoje: "2026-11-10",
      reguasEnvio: REGUA,
      passosCliente: opcoes.passosCliente,
    }),
  );
}

describe("selo de promessa no cartão da fatura", () => {
  it("mostra Promessa até uma vez na lista, mesmo com a régua ao lado", () => {
    const html = cartao({ promessa: true, passosCliente: null });
    expect(vezes(html, "Promessa até 10/11")).toBe(1);
    expect(html.match(/bg-gold-soft/g)).toHaveLength(1);
    expect(textosVisiveis(html)).toContain("Abrir fatura");
    expect(textosVisiveis(html)).toContain("Alterar");
    expect(html).toContain("Promessa até 10/11. A régua automática desta fatura está pausada.");
  });

  it("mostra Promessa até uma vez na ficha do cliente, ao lado do semáforo", () => {
    const html = cartao({ promessa: true, passosCliente: PASSOS });
    expect(vezes(html, "Promessa até 10/11")).toBe(1);
    expect(html.match(/bg-gold-soft/g)).toHaveLength(1);
  });

  it("não desenha o selo quando a fatura não tem promessa pendente", () => {
    const html = cartao({ promessa: false, passosCliente: null });
    expect(vezes(html, "Promessa até")).toBe(0);
    expect(html).not.toContain("bg-gold-soft");
  });
});
