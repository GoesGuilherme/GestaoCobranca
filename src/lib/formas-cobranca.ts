import { formaCobrancaDe } from "@/lib/cobranca";
import { PROVEDORES_PAGAMENTO, type ProvedorCodigo } from "@/lib/status-pagamento";
import type { FormaCobranca } from "@/lib/tipos";

// Nome de tela do Pix da chave da própria empresa. O enum do banco continua PIX_DIRETO.
export const ROTULO_PIX_DIRETO = "PIX direto (da empresa)";

export type FormaGravada = FormaCobranca;

export type OpcaoCobranca = {
  id: string;
  provedor: ProvedorCodigo;
  forma: FormaGravada;
  rotulo: string;
};

// O que a empresa tem ligado. Efí, Sicoob e Sicredi ficam de fora: não há cliente que emita.
export type DisponibilidadeCobranca = {
  pixDireto: boolean;
  asaas: boolean;
  cora: boolean;
  inter: boolean;
};

export type RotaCobranca = {
  provedor: ProvedorCodigo;
  forma: FormaGravada;
};

export type PainelFormasCobranca = {
  opcoes: OpcaoCobranca[];
  padraoId: string;
  padraoDisponivel: boolean;
};

const ASAAS: OpcaoCobranca[] = [
  { id: "ASAAS:PIX", provedor: "ASAAS", forma: "PIX", rotulo: "Pix (Asaas)" },
  { id: "ASAAS:BOLETO", provedor: "ASAAS", forma: "BOLETO", rotulo: "Boleto (Asaas)" },
  { id: "ASAAS:CREDIT_CARD", provedor: "ASAAS", forma: "CREDIT_CARD", rotulo: "Cartão de crédito (Asaas)" },
  { id: "ASAAS:UNDEFINED", provedor: "ASAAS", forma: "UNDEFINED", rotulo: "Cliente escolhe (Asaas)" },
];

const CORA: OpcaoCobranca = {
  id: "CORA:BOLETO_PIX",
  provedor: "CORA",
  forma: "BOLETO",
  rotulo: "Boleto + Pix (Cora)",
};

const INTER: OpcaoCobranca = {
  id: "INTER:BOLETO_PIX",
  provedor: "INTER",
  forma: "BOLETO",
  rotulo: "Boleto + Pix (Inter)",
};

const PIX: OpcaoCobranca = {
  id: "PIX_DIRETO",
  provedor: "PIX_DIRETO",
  forma: "PIX",
  rotulo: ROTULO_PIX_DIRETO,
};

// Métodos que o código realmente emite, não o catálogo de capacidades.
// Asaas: billingType BOLETO, PIX, CREDIT_CARD e UNDEFINED.
// Cora: payment_forms BANK_SLIP + PIX, uma cobrança só.
// Inter: formasRecebimento BOLETO + PIX, uma cobrança só.
// Pix da empresa: BR Code da chave cadastrada.
export function listarOpcoesCobranca(disponivel: DisponibilidadeCobranca): OpcaoCobranca[] {
  const opcoes: OpcaoCobranca[] = [];
  if (disponivel.pixDireto) opcoes.push(PIX);
  if (disponivel.asaas) opcoes.push(...ASAAS);
  if (disponivel.cora) opcoes.push(CORA);
  if (disponivel.inter) opcoes.push(INTER);
  return opcoes;
}

export function opcaoPorId(id: string, opcoes: readonly OpcaoCobranca[]): OpcaoCobranca | null {
  return opcoes.find((item) => item.id === id) ?? null;
}

export function idDaOpcao(provedor: string | null | undefined, forma: string | null | undefined): string {
  if (provedor === "PIX_DIRETO") return PIX.id;
  if (provedor === "CORA") return CORA.id;
  if (provedor === "INTER") return INTER.id;
  if (provedor === "ASAAS") {
    const gravada = formaCobrancaDe(forma);
    return `ASAAS:${gravada}`;
  }
  return "";
}

// A forma padrão segue o provedor da empresa. PIX_DIRETO não olha a preferência de boleto do Asaas.
export function idFormaPadrao(provedorEmpresa: string | null | undefined, formaPreferida: string | null | undefined): string {
  return idDaOpcao(provedorEmpresa, formaPreferida);
}

export function rotuloProvedor(codigo: string | null | undefined): string {
  if (codigo === "PIX_DIRETO") return ROTULO_PIX_DIRETO;
  if (codigo === "CORA") return "Cora";
  if (codigo === "INTER") return "Inter";
  if (codigo === "EFI") return "Efí";
  if (codigo === "SICOOB") return "Sicoob";
  if (codigo === "SICREDI") return "Sicredi";
  return "Asaas";
}

export function rotuloCobranca(provedor: string | null | undefined, forma: string | null | undefined): string {
  const id = idDaOpcao(provedor, forma);
  const conhecida = [PIX, ...ASAAS, CORA, INTER].find((item) => item.id === id);
  if (conhecida) return conhecida.rotulo;
  if (forma === "PIX") return "Pix";
  if (forma === "CREDIT_CARD") return "Cartão de crédito";
  if (forma === "UNDEFINED") return "Cliente escolhe";
  if (forma === "BOLETO") return "Boleto";
  return forma?.trim() || "Cobrança";
}

export const FILTROS_FORMA: { valor: string; rotulo: string }[] = [
  { valor: PIX.id, rotulo: PIX.rotulo },
  ...ASAAS.map((item) => ({ valor: item.id, rotulo: item.rotulo })),
  { valor: CORA.id, rotulo: CORA.rotulo },
  { valor: INTER.id, rotulo: INTER.rotulo },
];

export function lerFiltroForma(valor: string | undefined): { forma: FormaCobranca | null; provedor: ProvedorCodigo | null } {
  if (!valor) return { forma: null, provedor: null };
  if (valor === "BOLETO" || valor === "PIX" || valor === "CREDIT_CARD" || valor === "UNDEFINED") {
    return { forma: valor, provedor: null };
  }
  const opcao = [PIX, ...ASAAS, CORA, INTER].find((item) => item.id === valor);
  if (!opcao) return { forma: null, provedor: null };
  return { forma: opcao.forma, provedor: opcao.provedor };
}

export function chaveFiltroForma(forma: FormaCobranca | null, provedor: ProvedorCodigo | null): string {
  if (!forma) return "";
  if (!provedor) return forma;
  return idDaOpcao(provedor, forma);
}

function provedorConhecido(valor: string | null | undefined): ProvedorCodigo | null {
  if (valor && (PROVEDORES_PAGAMENTO as readonly string[]).includes(valor)) return valor as ProvedorCodigo;
  return null;
}

// Com provedor no pedido, a rota só existe se a empresa tiver essa forma.
// Sem provedor, vale o padrão da empresa, mesmo que o catálogo ainda não liste (chamada antiga).
export function escolherRota(entrada: {
  provedorInformado?: string | null;
  formaInformada?: string | null;
  provedorEmpresa: string;
  formaPadrao: string | null | undefined;
  opcoes: readonly OpcaoCobranca[];
}): RotaCobranca | null {
  const informado = entrada.provedorInformado?.trim() ?? "";
  if (informado) {
    const codigo = provedorConhecido(informado);
    if (!codigo) return null;
    const candidatos = entrada.opcoes.filter((item) => item.provedor === codigo);
    if (candidatos.length === 0) return null;
    if (!entrada.formaInformada) {
      if (candidatos.length === 1) return { provedor: codigo, forma: candidatos[0].forma };
      const preferida = formaCobrancaDe(entrada.formaPadrao);
      return {
        provedor: codigo,
        forma: (candidatos.find((item) => item.forma === preferida) ?? candidatos.find((item) => item.forma === "BOLETO") ?? candidatos[0]).forma,
      };
    }
    const forma = formaCobrancaDe(entrada.formaInformada);
    const exata = candidatos.find((item) => item.forma === forma);
    if (!exata) return null;
    return { provedor: codigo, forma: exata.forma };
  }

  const empresa = provedorConhecido(entrada.provedorEmpresa) ?? "ASAAS";
  if (empresa === "PIX_DIRETO") {
    if (entrada.formaInformada && formaCobrancaDe(entrada.formaInformada) !== "PIX") return null;
    return { provedor: "PIX_DIRETO", forma: "PIX" };
  }
  if (empresa === "CORA" || empresa === "INTER") {
    if (entrada.formaInformada && formaCobrancaDe(entrada.formaInformada) === "CREDIT_CARD") return null;
    return { provedor: empresa, forma: "BOLETO" };
  }
  if (empresa === "EFI" || empresa === "SICOOB" || empresa === "SICREDI") return null;
  const forma = entrada.formaInformada ? formaCobrancaDe(entrada.formaInformada) : formaCobrancaDe(entrada.formaPadrao);
  return { provedor: "ASAAS", forma };
}

export function whereRecorrenciaDoProvedor(provedor: "PIX_DIRETO" | "CORA" | "INTER", empresaId?: string) {
  return {
    recorrencia: "MENSAL" as const,
    status: "ATIVO" as const,
    asaasSubscriptionId: null,
    asaasAssinaturaStatus: "ACTIVE",
    proximoVencimento: { not: null },
    AND: [
      { empresa: { status: "ATIVA" as const, ...(empresaId ? { id: empresaId } : {}) } },
      {
        OR: [
          { provedorRecorrente: provedor },
          { provedorRecorrente: null, empresa: { provedorPagamento: provedor } },
        ],
      },
    ],
  };
}
