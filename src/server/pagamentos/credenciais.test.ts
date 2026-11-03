import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { lerCredenciaisPagamento, salvarCredenciaisPagamento } from "./credenciais";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "@/server/services/teste-db";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

usarBancoDeTeste();

describe("cofre de credenciais do provedor", () => {
  it("guarda client id, certificado e chave cifrados e devolve o mesmo conteúdo", async () => {
    const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Cofre", cnpj: completarCnpj("910000000001") });
    const certificado = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    const chave = "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----";
    await salvarCredenciaisPagamento({
      empresaId: empresa.id,
      provedor: "CORA",
      ambiente: "SANDBOX",
      credenciais: {
        clientId: "client-cora",
        clientSecret: "segredo-cora",
        certificadoPem: certificado,
        chavePrivadaPem: chave,
      },
      segredoWebhook: "segredo-do-webhook-cora",
      certificadoValidoAte: new Date("2027-01-15T00:00:00.000Z"),
    });

    const lido = await lerCredenciaisPagamento(empresa.id, "CORA");
    expect(lido?.ambiente).toBe("SANDBOX");
    expect(lido?.credenciais.clientId).toBe("client-cora");
    expect(lido?.credenciais.clientSecret).toBe("segredo-cora");
    expect(lido?.credenciais.certificadoPem).toBe(certificado);
    expect(lido?.credenciais.chavePrivadaPem).toBe(chave);
    expect(lido?.temSegredoWebhook).toBe(true);
    expect(lido?.certificadoValidoAte?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(JSON.stringify(lido)).not.toContain("segredo-do-webhook-cora");
  });

  it("recusa certificado sem a chave", async () => {
    const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Cofre 2", cnpj: completarCnpj("910000000002") });
    await expect(
      salvarCredenciaisPagamento({
        empresaId: empresa.id,
        provedor: "INTER",
        ambiente: "PRODUCAO",
        credenciais: { clientId: "inter", clientSecret: "x", certificadoPem: "cert" },
      }),
    ).rejects.toMatchObject({ codigo: "credencial_invalida" });
  });
});
