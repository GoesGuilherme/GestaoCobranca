import "dotenv/config";

// Vincula uma subconta Twilio que já existe. Não cria subconta, não compra
// número e não envia mensagem. A conta pai (TWILIO_ACCOUNT_SID) busca o auth
// token do SID e o banco guarda só a cifra de ASAAS_ENCRYPTION_KEY.
// O token não aparece neste log.
//
// TWILIO_CRIAR_SUBCONTA fica desligado. Este script não lê essa flag para criar.
//
// Collab Software (empresa collab_software): o SID da subconta começa com ACa916.
// Passe o SID completo em TWILIO_SUBCONTA_SID. Não cole o token.
//
// EMPRESA_ID=collab_software TWILIO_SUBCONTA_SID=AC... npx tsx scripts/vincular-subconta-twilio.ts

if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

function exigir(nome: "EMPRESA_ID" | "TWILIO_SUBCONTA_SID"): string {
  const valor = process.env[nome]?.trim() ?? "";
  if (!valor) {
    console.error(`Defina ${nome}.`);
    process.exit(1);
  }
  return valor;
}

async function main() {
  const empresaId = exigir("EMPRESA_ID");
  const sid = exigir("TWILIO_SUBCONTA_SID");
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) {
    console.error("TWILIO_SUBCONTA_SID precisa ser um SID de conta, com 34 caracteres e começo AC.");
    return 1;
  }

  const { prisma } = await import("../src/server/db");
  const { gravarSubcontaExistente } = await import("../src/server/services/twilio-empresa-service");

  try {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, nomeFantasia: true } });
    if (!empresa) {
      console.error("Empresa não encontrada.");
      return 1;
    }
    await gravarSubcontaExistente(empresa.id, sid);
    const linha = await prisma.subcontaTwilio.findUnique({
      where: { empresaId: empresa.id },
      select: { subaccountSid: true, credencialUltimos4: true, status: true },
    });
    console.log(
      `Subconta vinculada em ${empresa.nomeFantasia} (${empresa.id}): ${linha?.subaccountSid ?? sid}, status ${linha?.status ?? ""}, final ${linha?.credencialUltimos4 ?? ""}. Nenhuma mensagem foi enviada.`,
    );
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
    console.error(erro instanceof Error ? erro.message : "Falha ao vincular a subconta.");
    process.exit(1);
  });
