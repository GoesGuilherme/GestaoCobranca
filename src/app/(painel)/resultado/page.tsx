import { redirect } from "next/navigation";
import { destinoAbaResultado } from "@/lib/rotas-dashboard";

type Busca = Record<string, string | string[] | undefined>;

// Endereço antigo. A query segue para a aba Resultado.
export default async function PaginaResultadoAntiga({ searchParams }: { searchParams: Promise<Busca> }) {
  redirect(destinoAbaResultado(await searchParams));
}
