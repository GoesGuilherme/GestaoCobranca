import { redirect } from "next/navigation";

type Busca = Record<string, string | string[] | undefined>;

// Endereço antigo. Os filtros da query seguem para a aba Financeiro.
export default async function PaginaPainelFinanceiro({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (typeof valor === "string") busca.set(chave, valor);
    else if (valor) {
      for (const item of valor) busca.append(chave, item);
    }
  }
  const consulta = busca.toString();
  redirect(consulta ? `/dashboards/financeiro?${consulta}` : "/dashboards/financeiro");
}
