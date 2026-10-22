import { beforeEach } from "vitest";
import { somenteDocumento } from "@/lib/documento";
import { prisma } from "@/server/db";

export function usarBancoDeTeste() {
  beforeEach(async () => {
    const url = process.env.DATABASE_URL ?? "";
    if (!url.includes("gestaocobranca_test")) {
      throw new Error("Os testes só podem apagar dados do banco gestaocobranca_test.");
    }
    await prisma.filial.deleteMany();
    await prisma.cliente.deleteMany();
    await prisma.usuario.deleteMany();
    await prisma.limiteCadastro.deleteMany();
    await prisma.empresa.deleteMany();
  });
}

export async function criarEmpresaDeTeste(dados: {
  nomeFantasia: string;
  cnpj: string;
  status?: "ATIVA" | "SUSPENSA";
}) {
  return prisma.empresa.create({
    data: {
      razaoSocial: `${dados.nomeFantasia} Ltda`,
      nomeFantasia: dados.nomeFantasia,
      cnpj: somenteDocumento(dados.cnpj),
      emailContato: "contato@exemplo.test",
      telefone: "13988881001",
      status: dados.status ?? "ATIVA",
      plano: "basico",
    },
  });
}
