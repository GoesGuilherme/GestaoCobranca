import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Equivale ao antigo directUrl do schema: só o Prisma Migrate usa esta URL.
// No Supabase ela é a conexão direta ou o pooler em modo sessão (porta 5432).
// Não aponte para o pooler de transação (porta 6543). A aplicação lê DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
