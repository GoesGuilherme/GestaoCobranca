import "dotenv/config";

// Preenche faturas.pago_em das cobranças já pagas com a data que o Asaas devolve.
// Não entra no build nem no deploy. Sem --confirmar só conta, não chama o Asaas e não grava.

if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

function argumento(nome: string): string | null {
  const indice = process.argv.indexOf(nome);
  if (indice === -1) return null;
  const valor = process.argv[indice + 1]?.trim();
  return valor && !valor.startsWith("--") ? valor : null;
}

async function main() {
  const confirmar = process.argv.includes("--confirmar");
  const empresaId = argumento("--empresa");
  const { prisma } = await import("../src/server/db");
  const { contarFaturasSemPagoEm, empresasComAsaas, preencherPagoEmDaEmpresa } = await import(
    "../src/server/services/pago-em-retroativo"
  );

  try {
    const empresas = empresaId ? [empresaId] : await empresasComAsaas();
    if (empresas.length === 0) {
      console.log("Nenhuma empresa com Asaas configurado.");
      return 0;
    }

    if (!confirmar) {
      console.log("Contagem apenas. Nada foi gravado e o Asaas não foi chamado.");
      for (const id of empresas) {
        const candidatas = await contarFaturasSemPagoEm(id);
        console.log(`${id}: ${candidatas} fatura(s) paga(s) sem data de pagamento`);
      }
      console.log("Para gravar, rode de novo com --confirmar depois do ok do dono.");
      return 0;
    }

    for (const id of empresas) {
      const resultado = await preencherPagoEmDaEmpresa(id);
      console.log(
        `${id}: ${resultado.preenchidas} preenchida(s), ${resultado.restantes} ainda sem data, ${resultado.consultas} consulta(s) ao Asaas.`,
      );
      if (resultado.semConfiguracao) {
        console.log(`${id}: Asaas não configurado. Nada foi consultado.`);
      }
      if (resultado.interrompida) {
        const espera = resultado.esperaSegundos ?? 0;
        console.error(`${id}: o Asaas limitou ou recusou a consulta. Espere ${espera}s e rode de novo. O que já foi gravado permanece.`);
        return 1;
      }
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : "Não foi possível preencher a data de pagamento.");
    process.exit(1);
  });
