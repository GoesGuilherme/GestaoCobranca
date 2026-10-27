type Busca = Record<string, string | string[] | undefined>;

export function destinoAbaFinanceiro(params: Busca): string {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (typeof valor === "string") busca.set(chave, valor);
    else if (valor) {
      for (const item of valor) busca.append(chave, item);
    }
  }
  const consulta = busca.toString();
  return consulta ? `/dashboards/financeiro?${consulta}` : "/dashboards/financeiro";
}
