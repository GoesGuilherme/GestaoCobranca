import { exigirAcesso } from "@/server/auth/acesso";
import { ErroAplicacao } from "@/server/erros";
import { jsonErro, jsonOk } from "@/server/http";
import {
  contarFaturasSemPagoEm,
  empresasComAsaas,
  preencherPagoEmDaEmpresa,
} from "@/server/services/pago-em-retroativo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function empresaPedida(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object" || !("empresaId" in corpo)) return null;
  const valor = (corpo as { empresaId?: unknown }).empresaId;
  if (typeof valor !== "string" || !valor.trim()) return null;
  return valor.trim();
}

function confirmarPediu(corpo: unknown): boolean {
  return Boolean(corpo && typeof corpo === "object" && (corpo as { confirmar?: unknown }).confirmar === true);
}

async function lerCorpo(request: Request): Promise<unknown> {
  const texto = await request.text();
  if (!texto.trim()) return {};
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroAplicacao("O corpo da requisição não é um JSON válido.", 400, "json_invalido");
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcesso();
    const corpo = await lerCorpo(request);
    const pedida = empresaPedida(corpo);
    if (!acesso.superadministrador && acesso.papel !== "DONO") {
      throw new ErroAplicacao("Só o dono da empresa pode preencher a data de pagamento.", 403, "sem_permissao");
    }
    if (!acesso.superadministrador && pedida && pedida !== acesso.empresaId) {
      throw new ErroAplicacao("A data de pagamento de outra empresa não pode ser preenchida daqui.", 403, "sem_permissao");
    }

    const confirmar = confirmarPediu(corpo);
    const empresas = pedida ? [pedida] : acesso.superadministrador ? await empresasComAsaas() : [acesso.empresaId];
    if (!confirmar) {
      const contagem = await Promise.all(
        empresas.map(async (empresaId) => ({
          empresaId,
          candidatas: await contarFaturasSemPagoEm(empresaId),
        })),
      );
      return jsonOk({ confirmar: false, empresas: contagem });
    }

    const resultados = [];
    for (const empresaId of empresas) {
      const resultado = await preencherPagoEmDaEmpresa(empresaId);
      resultados.push(resultado);
      if (resultado.interrompida) break;
    }
    return jsonOk({ confirmar: true, empresas: resultados });
  } catch (erro) {
    return jsonErro(erro);
  }
}
