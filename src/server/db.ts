import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { urlParaPg } from "./url-pg";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("Defina DATABASE_URL para conectar ao PostgreSQL.");
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: urlParaPg(url),
      // Na Vercel cada instância é curta. Uma conexão basta; o pooler do Supabase multiplexa.
      max: process.env.VERCEL ? 1 : 10,
    }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
