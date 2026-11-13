import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { urlParaPg } from "./url-pg";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("Defina DATABASE_URL para conectar ao PostgreSQL.");
}

function tamanhoDoPool() {
  const bruto = process.env.PRISMA_POOL_MAX?.trim() ?? "";
  if (/^[1-9]\d*$/.test(bruto)) return Number(bruto);
  // Na Vercel cada instância é curta. Uma conexão basta; o pooler do Supabase multiplexa.
  return process.env.VERCEL ? 1 : 10;
}

export const tamanhoPoolPrisma = tamanhoDoPool();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: urlParaPg(url),
      max: tamanhoPoolPrisma,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
