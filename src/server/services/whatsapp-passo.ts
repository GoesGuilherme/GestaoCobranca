import type { ResultadoCanalReenvio } from "@/lib/tipos";
import { resolverWhatsappDoPasso, type TipoTemplateWhatsapp } from "@/lib/whatsapp-cobranca";
import { prisma } from "@/server/db";
import type { ClienteTwilio } from "@/server/twilio/contrato";
import { inicioWhatsappOficialProducao, remetenteOficialLigado } from "@/server/twilio/sandbox";
import { enfileirarWhatsappDoPasso, processarFilaWhatsapp } from "./whatsapp-fila";

type ClientePasso = {
  id: string;
  nomeFantasia: string;
  whatsapp: string;
  status: string;
  reguaModo: string;
  reguaPausada: boolean;
};

export type FaturaWhatsappPasso = {
  id: string;
  empresaId: string;
  valor: { toFixed(casas: number): string };
  vencimento: Date;
  boletoUrl: string | null;
  faturaUrl: string | null;
  excluida: boolean;
  criadoEm: Date;
  formaCobranca: string;
  cliente: ClientePasso;
};

export type PassoWhatsapp = {
  id: string;
  naEmissao: boolean;
  dias: number | null;
  enviarWhatsapp: boolean;
};

function canal(resultado: ResultadoCanalReenvio["resultado"], motivo: string | null): ResultadoCanalReenvio {
  return { canal: "WHATSAPP", resultado, motivo };
}

export function motivoWhatsappNaoAplica(
  fatura: FaturaWhatsappPasso,
  passo: PassoWhatsapp,
  modoTeste: boolean,
  agora = new Date(),
): string | null {
  if (!passo.enviarWhatsapp) return "Este passo não envia WhatsApp.";
  if (passo.naEmissao && !resolverWhatsappDoPasso(passo, fatura, agora)) return "Sem boleto.";
  if (fatura.excluida) return "Cobrança não está em aberto.";
  if (!modoTeste && remetenteOficialLigado()) {
    const inicio = inicioWhatsappOficialProducao();
    if (!inicio || fatura.criadoEm.getTime() < inicio.getTime()) {
      return "WhatsApp oficial ainda não vale para esta cobrança.";
    }
  }
  return null;
}

function canalDaLinha(status: string, motivo: string | null, jaAceito: boolean): ResultadoCanalReenvio {
  if (jaAceito && status === "ENVIADO") return canal("ignorado", "WhatsApp já aceito neste passo.");
  if (status === "ENVIADO") return canal("aceito", null);
  if (status === "FALHOU") return canal("falha", motivo || "Falha ao enviar.");
  if (status === "IGNORADO") return canal("ignorado", motivo || "WhatsApp ignorado.");
  return canal("na_fila", motivo);
}

async function lerLinha(empresaId: string, faturaId: string, passoId: string, tipo: string) {
  return prisma.filaWhatsapp.findFirst({
    where: { empresaId, faturaId, passoId, tipo },
    select: { status: true, motivo: true },
  });
}

// Enfileira pelo mesmo caminho da régua. Não cria outro template nem outra chave.
// Se o passo já foi aceito, não manda de novo.
export async function prepararWhatsappDoPasso(
  fatura: FaturaWhatsappPasso,
  passo: PassoWhatsapp,
  modoTeste: boolean,
  agora = new Date(),
): Promise<{ processar: boolean; canal: ResultadoCanalReenvio | null }> {
  const naoAplica = motivoWhatsappNaoAplica(fatura, passo, modoTeste, agora);
  if (naoAplica) return { processar: false, canal: canal("ignorado", naoAplica) };
  const tipo = resolverWhatsappDoPasso(passo, fatura, agora)?.tipo;
  if (!tipo) return { processar: false, canal: canal("ignorado", "WhatsApp não se aplica a esta cobrança.") };
  const fila = await enfileirarWhatsappDoPasso(fatura, passo, modoTeste, agora);
  const linha = await lerLinha(fatura.empresaId, fatura.id, passo.id, tipo);
  if (!linha) return { processar: false, canal: canal("ignorado", "WhatsApp não se aplica a esta cobrança.") };
  if (fila === "existente" && (linha.status === "ENVIADO" || linha.status === "IGNORADO" || linha.status === "FALHOU")) {
    return { processar: false, canal: canalDaLinha(linha.status, linha.motivo, true) };
  }
  if (linha.status === "PENDENTE" || linha.status === "PROCESSANDO") return { processar: true, canal: null };
  return { processar: false, canal: canalDaLinha(linha.status, linha.motivo, false) };
}

export async function concluirWhatsappDoPasso(
  empresaId: string,
  faturaIds: string[],
  passos: PassoWhatsapp[],
  twilio: ClienteTwilio,
  agora = new Date(),
): Promise<void> {
  if (faturaIds.length === 0) return;
  const tipos = new Set<TipoTemplateWhatsapp>();
  for (const passo of passos) {
    if (passo.naEmissao) {
      tipos.add("BOLETO_GERADO");
      tipos.add("VENCE_EM_DIAS");
      tipos.add("VENCEU");
      continue;
    }
    const tipo = resolverWhatsappDoPasso(passo, null)?.tipo;
    if (tipo) tipos.add(tipo);
  }
  await processarFilaWhatsapp({
    agora,
    empresaId,
    twilio,
    tipos: [...tipos],
    faturaIds,
    limite: faturaIds.length,
    conciliar: false,
  });
}

export async function canalWhatsappGravado(
  fatura: FaturaWhatsappPasso,
  passo: PassoWhatsapp,
): Promise<ResultadoCanalReenvio> {
  const tipo = resolverWhatsappDoPasso(passo, fatura)?.tipo;
  const linha = tipo ? await lerLinha(fatura.empresaId, fatura.id, passo.id, tipo) : null;
  if (!linha) return canal("ignorado", "WhatsApp não se aplica a esta cobrança.");
  return canalDaLinha(linha.status, linha.motivo, false);
}
