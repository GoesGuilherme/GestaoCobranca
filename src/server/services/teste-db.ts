import { beforeEach } from "vitest";
import { prisma } from "@/server/db";

export function usarBancoDeTeste() {
  beforeEach(async () => {
    const url = process.env.DATABASE_URL ?? "";
    if (!url.includes("gestaocobranca_test")) {
      throw new Error("Os testes só podem apagar dados do banco gestaocobranca_test.");
    }
    await prisma.filial.deleteMany();
    await prisma.cliente.deleteMany();
  });
}
