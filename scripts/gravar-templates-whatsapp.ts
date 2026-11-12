import "dotenv/config";

// Grava os ContentSids dos modelos de WhatsApp da empresa. Consulta o status
// real na subconta (ContentAndApprovals) e só grava Aprovado se a Meta aprovou.
// Não envia mensagem. Variável vazia apaga o modelo daquele tipo.
// A empresa precisa já ter a subconta vinculada.
//
// Collab Software (empresa collab_software), ContentSids da subconta:
// BOLETO_GERADO  HX1c2451e77bedd7d377700c1cc1e98438
// VENCE_EM_DIAS  HXff6d4cd5fe910bffb51dd2c186f3edb3
// VENCEU         HX04c94663135f4c779b7d0725f3c646d3
// PAGO           HXb73e89681a6ccfcda2c20d298d324c3b
// VENCE_HOJE     HX578d21bad62d99aa8e22582067eb2ec2
//
// EMPRESA_ID=collab_software \
// TEMPLATE_SID_BOLETO_GERADO=HX... \
// TEMPLATE_SID_VENCE_EM_DIAS=HX... \
// TEMPLATE_SID_VENCEU=HX... \
// TEMPLATE_SID_PAGO=HX... \
// TEMPLATE_SID_VENCE_HOJE=HX... \
// npx tsx scripts/gravar-templates-whatsapp.ts

if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const TIPOS = ["BOLETO_GERADO", "VENCE_EM_DIAS", "VENCE_HOJE", "VENCEU", "PAGO"] as const;

async function main() {
  const empresaId = process.env.EMPRESA_ID?.trim() ?? "";
  if (!empresaId) {
    console.error("Defina EMPRESA_ID.");
    return 1;
  }
  const templates = TIPOS.flatMap((tipo) => {
    const contentSid = process.env[`TEMPLATE_SID_${tipo}`]?.trim() ?? "";
    if (!contentSid) return [];
    return [{ tipo, contentSid }];
  });
  if (templates.length === 0) {
    console.error("Defina ao menos um TEMPLATE_SID_<TIPO>.");
    return 1;
  }

  const { prisma } = await import("../src/server/db");
  const { gravarTemplatesDaEmpresa } = await import("../src/server/services/twilio-empresa-service");

  try {
    const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, nomeFantasia: true } });
    if (!empresa) {
      console.error("Empresa não encontrada.");
      return 1;
    }
    await gravarTemplatesDaEmpresa(empresa.id, { templates });
    const linhas = await prisma.templateWhatsapp.findMany({
      where: { empresaId: empresa.id },
      select: { tipo: true, status: true, contentSid: true },
      orderBy: { tipo: "asc" },
    });
    console.log(`Modelos gravados em ${empresa.nomeFantasia} (${empresa.id}). Nenhuma mensagem foi enviada.`);
    for (const linha of linhas) {
      console.log(`${linha.tipo}: ${linha.status} ${linha.contentSid ?? ""}`);
    }
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
    console.error(erro instanceof Error ? erro.message : "Falha ao gravar os modelos.");
    process.exit(1);
  });
