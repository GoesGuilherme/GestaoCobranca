import { redirect } from "next/navigation";
import { destinoAbaFinanceiro } from "@/lib/rotas-dashboard";

type Busca = Record<string, string | string[] | undefined>;

// Endereço antigo. Os filtros da query seguem para a aba Financeiro.
export default async function PaginaPainelFinanceiro({ searchParams }: { searchParams: Promise<Busca> }) {
  redirect(destinoAbaFinanceiro(await searchParams));
}
