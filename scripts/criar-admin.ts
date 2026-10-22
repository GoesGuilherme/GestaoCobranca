import "dotenv/config";

if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

function exigir(nome: "ADMIN_NOME" | "ADMIN_EMAIL" | "ADMIN_SENHA"): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    console.error(`Defina ${nome} antes de criar o acesso.`);
    process.exit(1);
  }
  return valor;
}

function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const nome = exigir("ADMIN_NOME");
  const email = exigir("ADMIN_EMAIL").toLowerCase();
  const senha = exigir("ADMIN_SENHA");

  if (!emailValido(email)) {
    console.error("ADMIN_EMAIL não parece um e-mail.");
    process.exit(1);
  }

  const { ID_EMPRESA_COLLAB } = await import("../src/lib/collab");
  const { prisma } = await import("../src/server/db");
  const { gerarHashSenha } = await import("../src/server/auth/senha");

  try {
    const empresa = await prisma.empresa.findUnique({ where: { id: ID_EMPRESA_COLLAB } });
    if (!empresa) {
      console.error("A empresa Collab Software ainda não existe. Rode as migrations antes.");
      return 1;
    }

    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      console.error(`Já existe um acesso com o e-mail ${email}. A senha não foi alterada.`);
      return 1;
    }

    await prisma.usuario.create({
      data: {
        nome,
        email,
        senhaHash: await gerarHashSenha(senha),
        empresaId: empresa.id,
        papel: "DONO",
        superadministrador: true,
      },
    });
    console.log(`Acesso de superadministrador criado na Collab Software: ${email}`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((codigo) => {
    process.exit(codigo);
  })
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
