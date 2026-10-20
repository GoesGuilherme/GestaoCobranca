import { config } from "dotenv";
import { afterAll } from "vitest";

config();

const base = process.env.TEST_DATABASE_URL
  ?? process.env.DIRECT_URL
  ?? process.env.DATABASE_URL
  ?? "postgresql://gestao:gestao@127.0.0.1:5432/gestaocobranca";

const url = new URL(base);
url.pathname = "/gestaocobranca_test";

process.env.DATABASE_URL = url.toString();
process.env.DIRECT_URL = url.toString();
process.env.AUTH_SECRET ??= "segredo-de-teste-com-32-caracteres-ok";

if (!process.env.DATABASE_URL.includes("/gestaocobranca_test")) {
  throw new Error("Os testes só podem usar o banco gestaocobranca_test.");
}

afterAll(async () => {
  const { prisma } = await import("./src/server/db");
  await prisma.$disconnect();
});
