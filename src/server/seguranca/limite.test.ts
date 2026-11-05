import { beforeEach, describe, expect, it } from "vitest";
import { POST as entrar } from "@/app/api/auth/entrar/route";
import { POST as webhookAsaas } from "@/app/api/webhooks/asaas/route";
import { completarCnpj } from "@/lib/documento";
import { gerarHashSenha } from "@/server/auth/senha";
import { prisma } from "@/server/db";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "@/server/services/teste-db";

usarBancoDeTeste();

async function pedidoLogin(senha: string) {
  return entrar(
    new Request("http://localhost/api/auth/entrar", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
      body: JSON.stringify({ email: "limite-login@exemplo.test", senha }),
    }),
  );
}

describe("limite de tentativas", () => {
  beforeEach(async () => {
    const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Empresa Limite", cnpj: completarCnpj("593000000001") });
    await prisma.usuario.create({
      data: {
        nome: "Dono Limite",
        email: "limite-login@exemplo.test",
        senhaHash: await gerarHashSenha("senha-certa-123"),
        empresaId: empresa.id,
        papel: "DONO",
      },
    });
  });

  it("trava o login depois de oito senhas erradas e não revela o segredo", async () => {
    for (let i = 0; i < 8; i += 1) {
      const resposta = await pedidoLogin("senha-errada");
      expect(resposta.status).toBe(401);
    }
    const travado = await pedidoLogin("senha-certa-123");
    expect(travado.status).toBe(429);
    const corpo = await travado.json();
    expect(corpo.erro).toBe("Muitas tentativas. Tente de novo mais tarde.");
    expect(JSON.stringify(corpo)).not.toContain("senha-certa-123");
  });

  it("responde 429 para rajada de webhook do Asaas sem assinatura válida", async () => {
    const pedido = () =>
      webhookAsaas(
        new Request("http://localhost/api/webhooks/asaas", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
          body: "{}",
        }),
      );
    for (let i = 0; i < 30; i += 1) expect((await pedido()).status).toBe(401);
    expect((await pedido()).status).toBe(429);
  });
});
