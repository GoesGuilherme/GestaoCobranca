import { describe, expect, it, vi } from "vitest";
import { AsaasMemoria } from "@/server/asaas/memoria";
import { criarAdaptadorAsaas } from "./adaptador-asaas";
import { confirmarEventoParaBaixa } from "./baixa";
import { CAPACIDADES_ASAAS, precisaReconsultarAntesDeBaixar, usaRecorrenciaPropria } from "./capacidades";
import { empresaPrecisaConciliacao, empresaPrecisaRecorrenciaPropria } from "./preparo";
import { normalizarWebhookAsaas, sinalAsaasConfirmaPagamento } from "./webhook-asaas";
import type { CobrancaNormalizada, ProvedorPagamento } from "./tipos";

describe("webhook do Asaas normalizado", () => {
  it("marca pago, vencido, estorno e visualização sem confundir os efeitos", () => {
    const pago = normalizarWebhookAsaas({
      id: "evt_pago",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_1",
        status: "RECEIVED",
        value: 10,
        billingType: "PIX",
        clientPaymentDate: "2026-11-02",
      },
    });
    expect(pago).toMatchObject({
      idEvento: "evt_pago",
      idExterno: "pay_1",
      status: "PAGO",
      statusBruto: "RECEIVED",
      meio: "PIX",
      pagoEm: "2026-11-02",
      visualizacao: false,
      alteraCobranca: true,
      confirmaPagamento: true,
    });

    const vencido = normalizarWebhookAsaas({
      id: "evt_vencido",
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay_2", status: "OVERDUE", billingType: "BOLETO" },
    });
    expect(vencido?.status).toBe("VENCIDO");
    expect(vencido?.confirmaPagamento).toBe(false);

    const estorno = normalizarWebhookAsaas({
      id: "evt_estorno",
      event: "PAYMENT_REFUNDED",
      payment: { id: "pay_3", status: "REFUNDED", billingType: "CREDIT_CARD" },
    });
    expect(estorno).toMatchObject({ status: "ESTORNADO", meio: "CARTAO", confirmaPagamento: false });

    const vista = normalizarWebhookAsaas({
      id: "evt_vista",
      event: "PAYMENT_BANK_SLIP_VIEWED",
      payment: { id: "pay_4", status: "PENDING" },
    });
    expect(vista).toMatchObject({ visualizacao: true, alteraCobranca: false, confirmaPagamento: false, status: null });
    expect(normalizarWebhookAsaas({ event: "PAYMENT_RECEIVED" })).toBeNull();
  });

  it("confirma pagamento como o webhook já fazia", () => {
    expect(sinalAsaasConfirmaPagamento("PAYMENT_RECEIVED", null)).toBe(true);
    expect(sinalAsaasConfirmaPagamento("PAYMENT_CONFIRMED", { status: "PENDING" })).toBe(true);
    expect(sinalAsaasConfirmaPagamento("PAYMENT_UPDATED", { status: "received" })).toBe(true);
    expect(sinalAsaasConfirmaPagamento("PAYMENT_UPDATED", { status: "PENDING" })).toBe(false);
    expect(sinalAsaasConfirmaPagamento("PAYMENT_REFUNDED", { status: "REFUNDED" })).toBe(false);
    expect(sinalAsaasConfirmaPagamento("PAYMENT_DELETED", { status: "RECEIVED" })).toBe(true);
  });
});

describe("baixa só depois de consultar quando o webhook não é assinado", () => {
  function cobranca(status: CobrancaNormalizada["status"], statusBruto: string): CobrancaNormalizada {
    return {
      idExterno: "bol_1",
      idClienteExterno: null,
      idAssinaturaExterna: null,
      valor: "10.00",
      vencimento: "2026-11-10",
      statusBruto,
      status,
      formaCobranca: "BOLETO",
      meio: "BOLETO",
      boletoUrl: null,
      faturaUrl: null,
      descricao: null,
      excluida: false,
      pagoEm: status === "PAGO" ? "2026-11-10" : null,
    };
  }

  function provedor(assinado: boolean, atual: CobrancaNormalizada | Error): Pick<ProvedorPagamento, "capacidades" | "consultarCobranca"> {
    return {
      capacidades: () => ({ ...CAPACIDADES_ASAAS, webhookAssinado: assinado }),
      consultarCobranca: vi.fn(async () => {
        if (atual instanceof Error) throw atual;
        return atual;
      }),
    };
  }

  const eventoPago = {
    idEvento: "evt_1",
    idExterno: "bol_1",
    tipo: "invoice.paid",
    status: "PAGO" as const,
    statusBruto: "PAID",
    pagoEm: "2026-11-10",
    valor: "10.00",
    meio: "BOLETO" as const,
    visualizacao: false,
    alteraCobranca: true,
    confirmaPagamento: true,
    bruto: {},
  };

  it("provedor assinado não consulta", async () => {
    const alvo = provedor(true, cobranca("PENDENTE", "OPEN"));
    const resultado = await confirmarEventoParaBaixa(alvo, eventoPago);
    expect(resultado).toMatchObject({ baixar: true, consultou: false });
    expect(alvo.consultarCobranca).not.toHaveBeenCalled();
  });

  it("sem assinatura, só baixa se a consulta confirmar o mesmo status", async () => {
    const confirma = provedor(false, cobranca("PAGO", "PAID"));
    await expect(confirmarEventoParaBaixa(confirma, eventoPago)).resolves.toMatchObject({
      baixar: true,
      consultou: true,
    });

    const diverge = provedor(false, cobranca("PENDENTE", "OPEN"));
    const recusado = await confirmarEventoParaBaixa(diverge, eventoPago);
    expect(recusado.baixar).toBe(false);
    expect(recusado.evento.status).toBe("PENDENTE");

    const falha = provedor(false, new Error("timeout"));
    await expect(confirmarEventoParaBaixa(falha, eventoPago)).resolves.toMatchObject({
      baixar: false,
      consultou: true,
    });
  });

  it("Asaas segue com assinatura nativa e webhook assinado", () => {
    expect(usaRecorrenciaPropria(CAPACIDADES_ASAAS)).toBe(false);
    expect(precisaReconsultarAntesDeBaixar(CAPACIDADES_ASAAS)).toBe(false);
    expect(empresaPrecisaRecorrenciaPropria({ capacidades: () => CAPACIDADES_ASAAS })).toBe(false);
    expect(empresaPrecisaConciliacao({ capacidades: () => CAPACIDADES_ASAAS })).toBe(false);
  });
});

describe("adaptador Asaas", () => {
  it("cria, consulta e cancela no cliente atual e devolve o status do Taguaro", async () => {
    const memoria = new AsaasMemoria("adaptador");
    const cliente = await memoria.criarCliente({ nome: "Ana Exemplo", cpfCnpj: "12345678901" });
    const adaptador = criarAdaptadorAsaas(memoria);
    expect(adaptador.capacidades().visualizacao).toBe(true);
    expect(adaptador.capacidades().assinaturaNativa).toBe(true);

    const criada = await adaptador.criarCobranca({
      idClienteExterno: cliente.id,
      formaCobranca: "BOLETO",
      valor: "25.00",
      vencimento: "2026-12-01",
      chaveIdempotencia: "fatura-1",
      descricao: "Mensalidade",
    });
    expect(criada.status).toBe("PENDENTE");
    expect(criada.statusBruto).toBe("PENDING");
    expect(criada.meio).toBe("BOLETO");

    const deNovo = await adaptador.criarCobranca({
      idClienteExterno: cliente.id,
      formaCobranca: "BOLETO",
      valor: "25.00",
      vencimento: "2026-12-01",
      chaveIdempotencia: "fatura-1",
    });
    expect(deNovo.idExterno).toBe(criada.idExterno);

    const consultada = await adaptador.consultarCobranca(criada.idExterno);
    expect(consultada.idExterno).toBe(criada.idExterno);
    await adaptador.cancelarCobranca(criada.idExterno);
    expect((await adaptador.consultarCobranca(criada.idExterno)).excluida).toBe(true);

    const eventos = await adaptador.normalizarWebhook({
      headers: new Headers(),
      corpo: {
        id: "evt_adaptador",
        event: "PAYMENT_CONFIRMED",
        payment: { id: criada.idExterno, status: "CONFIRMED", billingType: "BOLETO" },
      },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.status).toBe("PAGO");
  });
});
