const PARAMETROS_SO_DO_PRISMA = [
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
  "statement_cache_size",
  "socket_timeout",
];

// O driver `pg` não entende `pgbouncer=true`. Esse parâmetro marca a URL do
// pooler de transação do Supabase (porta 6543). O adapter não nomeia
// prepared statements, que é o que esse pooler exige.
export function urlParaPg(valor: string): string {
  const url = new URL(valor);
  for (const chave of PARAMETROS_SO_DO_PRISMA) {
    url.searchParams.delete(chave);
  }
  return url.toString();
}
