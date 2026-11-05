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
export function urlParaPg(valor: string, env: NodeJS.ProcessEnv = process.env): string {
  const url = new URL(valor);
  for (const chave of PARAMETROS_SO_DO_PRISMA) {
    url.searchParams.delete(chave);
  }
  // Só liga quando o operador já criou o papel e apontou a runtime para ele.
  // O pooler de transação da porta 6543 pode ignorar este parâmetro: nesse caso
  // a DATABASE_URL de runtime precisa ser um login que não é superusuário.
  if (env.TAGUARO_DB_PAPEL === "taguaro_app" && !url.searchParams.has("options")) {
    url.searchParams.set("options", "-c role=taguaro_app");
  }
  return url.toString();
}
