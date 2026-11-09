import type { ProvedorCodigo } from "@/lib/status-pagamento";
import type { Capacidades } from "./tipos";

export const CAPACIDADES_ASAAS: Capacidades = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: true,
  cartao: true,
  assinaturaNativa: true,
  pixAutomatico: false,
  visualizacao: true,
  precisaClienteRemoto: true,
  editarVencimento: true,
  webhookAssinado: true,
};

// Parceria Cora, boleto v2 com Pix. Sem assinatura nativa e sem assinatura de webhook.
// A API de fatura que usamos não edita vencimento: o boleto emitido fica como saiu.
export const CAPACIDADES_CORA: Capacidades = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: false,
  cartao: false,
  assinaturaNativa: false,
  pixAutomatico: false,
  visualizacao: false,
  precisaClienteRemoto: false,
  editarVencimento: false,
  webhookAssinado: false,
};

export const CAPACIDADES_INTER: Capacidades = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: true,
  cartao: false,
  assinaturaNativa: false,
  pixAutomatico: false,
  visualizacao: false,
  precisaClienteRemoto: false,
  editarVencimento: true,
  webhookAssinado: false,
};

const CAPACIDADES_EFI: Capacidades = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: true,
  cartao: false,
  assinaturaNativa: true,
  pixAutomatico: true,
  visualizacao: false,
  precisaClienteRemoto: false,
  editarVencimento: true,
  webhookAssinado: true,
};

const CAPACIDADES_SICOOB: Capacidades = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: true,
  cartao: false,
  assinaturaNativa: false,
  pixAutomatico: false,
  visualizacao: false,
  precisaClienteRemoto: false,
  editarVencimento: true,
  webhookAssinado: false,
};

const CAPACIDADES_SICREDI: Capacidades = {
  boleto: true,
  boletoComPix: true,
  pixComVencimento: true,
  cartao: false,
  assinaturaNativa: false,
  pixAutomatico: false,
  visualizacao: false,
  precisaClienteRemoto: false,
  editarVencimento: true,
  webhookAssinado: false,
};

export type ItemCatalogoProvedor = {
  codigo: ProvedorCodigo;
  nome: string;
  disponivel: boolean;
  capacidades: Capacidades;
};

export const CATALOGO_PROVEDORES: readonly ItemCatalogoProvedor[] = [
  { codigo: "ASAAS", nome: "Asaas", disponivel: true, capacidades: CAPACIDADES_ASAAS },
  { codigo: "CORA", nome: "Cora", disponivel: true, capacidades: CAPACIDADES_CORA },
  { codigo: "INTER", nome: "Inter", disponivel: true, capacidades: CAPACIDADES_INTER },
  { codigo: "EFI", nome: "Efí", disponivel: false, capacidades: CAPACIDADES_EFI },
  { codigo: "SICOOB", nome: "Sicoob", disponivel: false, capacidades: CAPACIDADES_SICOOB },
  { codigo: "SICREDI", nome: "Sicredi", disponivel: false, capacidades: CAPACIDADES_SICREDI },
];

export function itemCatalogo(codigo: ProvedorCodigo): ItemCatalogoProvedor {
  const item = CATALOGO_PROVEDORES.find((candidato) => candidato.codigo === codigo);
  if (!item) return CATALOGO_PROVEDORES[0];
  return item;
}

export function provedorEstaDisponivel(codigo: ProvedorCodigo): boolean {
  return itemCatalogo(codigo).disponivel;
}

// Bancos sem assinatura nativa passam a gerar a cobrança do mês no Taguaro.
// O Asaas continua na assinatura nativa. O cron /api/cron/recorrencias só
// percorre empresas cujo provedor não tem assinatura.
export function usaRecorrenciaPropria(capacidades: Capacidades): boolean {
  return !capacidades.assinaturaNativa;
}

export function precisaReconsultarAntesDeBaixar(capacidades: Capacidades): boolean {
  return !capacidades.webhookAssinado;
}
