import type { ConfiguracaoReguaDTO } from "@/lib/tipos";

export async function lerConfiguracaoRegua(): Promise<ConfiguracaoReguaDTO | null> {
  try {
    const resposta = await fetch("/api/regua");
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { config?: ConfiguracaoReguaDTO };
    return dados.config ?? null;
  } catch {
    return null;
  }
}
