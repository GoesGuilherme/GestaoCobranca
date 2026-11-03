import type { ProvedorPagamento } from "./tipos";
import { precisaReconsultarAntesDeBaixar, usaRecorrenciaPropria } from "./capacidades";

// Ganchos da próxima etapa. Não há cron novo: o Asaas segue com assinatura
// nativa e com o webhook que já autentica o token.

export function empresaPrecisaRecorrenciaPropria(provedor: Pick<ProvedorPagamento, "capacidades">): boolean {
  return usaRecorrenciaPropria(provedor.capacidades());
}

export function empresaPrecisaConciliacao(provedor: Pick<ProvedorPagamento, "capacidades">): boolean {
  return precisaReconsultarAntesDeBaixar(provedor.capacidades());
}
