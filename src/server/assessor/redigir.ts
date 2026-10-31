import { intencaoCobranca } from "@/lib/assessor-escopo";
import type { FerramentasAssessor, ResultadoFerramenta } from "./ferramentas";

export async function redigirComFerramentas(textoUsuario: string, ferramentas: FerramentasAssessor): Promise<ResultadoFerramenta> {
  const intencao = intencaoCobranca(textoUsuario);
  if (intencao === "PAGAMENTO") return ferramentas.consultarPagamento(null);
  if (intencao === "LINK") return ferramentas.linkBoleto(null);
  return ferramentas.listarFaturas();
}

export function textoConfiavel(texto: string, saidas: ResultadoFerramenta[]): boolean {
  const base = JSON.stringify(saidas);
  if (!texto.trim()) return false;
  const urls = texto.match(/https?:\/\/[^\s]+/g) ?? [];
  for (const url of urls) {
    const limpo = url.replace(/[).,]+$/g, "");
    if (!base.includes(limpo)) return false;
  }
  const valores = texto.match(/R\$\s?[\d.]+,\d{2}/g) ?? [];
  for (const valor of valores) {
    if (!base.includes(valor.replace(/\s/g, "")) && !base.includes(valor)) return false;
  }
  return true;
}

export function juntarTextos(saidas: ResultadoFerramenta[]): string {
  return saidas.map((saida) => saida.texto.trim()).filter(Boolean).join("\n");
}
