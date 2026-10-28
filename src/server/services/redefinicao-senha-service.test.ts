import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { MENSAGEM_REDEFINICAO_ENVIADA } from "@/lib/redefinicao-senha";
import { middleware } from "@/middleware";
import { autenticar } from "@/server/auth/entrar";
import { gerarHashSenha } from "@/server/auth/senha";
import type { EmailAuth } from "@/server/auth/email-auth";
import { prisma } from "@/server/db";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { pedirRedefinicaoSenha, redefinirSenha } from "./redefinicao-senha-service";

usarBancoDeTeste();

const AGORA = new Date("2026-10-28T15:00:00.000Z");
const REMETENTE = { chave: "re_teste", de: "Taguaro <senha@exemplo.test>" };

function caixa() {
  const enviados: EmailAuth[] = [];
  return {
    enviados,
    async enviar(dados: EmailAuth) {
      enviados.push(dados);
    },
  };
}

function tokenDoEmail(texto: string): string {
  const achado = texto.match(/token=([A-Za-z0-9_-]+)/);
  if (!achado?.[1]) throw new Error("o e-mail não trouxe o link");
  return achado[1];
}

async function usuario(email: string) {
  const empresa = await criarEmpresaDeTeste({
    nomeFantasia: "Empresa Senha",
    cnpj: completarCnpj("560000000001"),
  });
  await prisma.usuario.create({
    data: {
      nome: "Marina Teste",
      email,
      senhaHash: await gerarHashSenha("senha-antiga-123"),
      empresaId: empresa.id,
      papel: "DONO",
    },
  });
}

describe("redefinição de senha", () => {
  it("responde igual para e-mail cadastrado e desconhecido, e só grava o hash", async () => {
    await usuario("marina.senha@exemplo.test");
    const correio = caixa();
    const desconhecido = await pedirRedefinicaoSenha(
      { email: "ninguem@exemplo.test" },
      { ip: null, origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: correio.enviar },
    );
    const conhecido = await pedirRedefinicaoSenha(
      { email: "Marina.Senha@exemplo.test" },
      { ip: null, origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: correio.enviar },
    );

    expect(desconhecido.mensagem).toBe(MENSAGEM_REDEFINICAO_ENVIADA);
    expect(conhecido.mensagem).toBe(desconhecido.mensagem);
    expect(correio.enviados).toHaveLength(1);
    expect(correio.enviados[0]?.para).toBe("marina.senha@exemplo.test");

    const token = tokenDoEmail(correio.enviados[0]?.texto ?? "");
    const gravados = await prisma.redefinicaoSenha.findMany();
    expect(gravados).toHaveLength(1);
    expect(JSON.stringify(gravados)).not.toContain(token);
    expect(gravados[0]?.expiraEm.toISOString()).toBe("2026-10-28T16:00:00.000Z");
  });

  it("invalida o link anterior, aceita o novo uma vez e troca a senha e a sessão", async () => {
    await usuario("marina.senha@exemplo.test");
    const correio = caixa();
    await pedirRedefinicaoSenha(
      { email: "marina.senha@exemplo.test" },
      { ip: null, origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: correio.enviar },
    );
    await pedirRedefinicaoSenha(
      { email: "marina.senha@exemplo.test" },
      { ip: null, origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: correio.enviar },
    );
    const primeiro = tokenDoEmail(correio.enviados[0]?.texto ?? "");
    const segundo = tokenDoEmail(correio.enviados[1]?.texto ?? "");

    await expect(redefinirSenha({ token: primeiro, senha: "senha-nova-123", confirmacao: "senha-nova-123" }, { agora: AGORA })).rejects.toMatchObject({
      codigo: "link_invalido",
    });
    await redefinirSenha({ token: segundo, senha: "senha-nova-123", confirmacao: "senha-nova-123" }, { agora: AGORA });
    await expect(redefinirSenha({ token: segundo, senha: "senha-nova-456", confirmacao: "senha-nova-456" }, { agora: AGORA })).rejects.toMatchObject({
      codigo: "link_invalido",
    });

    await expect(autenticar("marina.senha@exemplo.test", "senha-antiga-123")).rejects.toMatchObject({ status: 401 });
    await expect(autenticar("marina.senha@exemplo.test", "senha-nova-123")).resolves.toMatchObject({ versaoSessao: 1 });
  });

  it("recusa link vencido e senha fora da regra do cadastro", async () => {
    await usuario("marina.senha@exemplo.test");
    const correio = caixa();
    await pedirRedefinicaoSenha(
      { email: "marina.senha@exemplo.test" },
      { ip: null, origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: correio.enviar },
    );
    const token = tokenDoEmail(correio.enviados[0]?.texto ?? "");
    await expect(
      redefinirSenha(
        { token, senha: "senha-nova-123", confirmacao: "senha-nova-123" },
        { agora: new Date(AGORA.getTime() + 60 * 60 * 1000) },
      ),
    ).rejects.toMatchObject({ codigo: "link_invalido" });
    await expect(
      redefinirSenha({ token, senha: "curta", confirmacao: "curta" }, { agora: AGORA }),
    ).rejects.toMatchObject({
      message: "A senha precisa ter pelo menos 8 caracteres.",
    });
    await expect(
      redefinirSenha({ token, senha: "senha-nova-123", confirmacao: "outra-senha" }, { agora: AGORA }),
    ).rejects.toMatchObject({
      message: "A confirmação não confere com a senha.",
    });
  });

  it("limita os pedidos sem dizer se o e-mail existe", async () => {
    for (let vez = 0; vez < 5; vez += 1) {
      const resposta = await pedirRedefinicaoSenha(
        { email: "ausente@exemplo.test" },
        { ip: "203.0.113.10", origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: async () => undefined },
      );
      expect(resposta.mensagem).toBe(MENSAGEM_REDEFINICAO_ENVIADA);
    }
    await expect(
      pedirRedefinicaoSenha(
        { email: "ausente@exemplo.test" },
        { ip: "203.0.113.10", origem: "https://taguaro.exemplo", agora: AGORA, remetente: REMETENTE, enviar: async () => undefined },
      ),
    ).rejects.toMatchObject({ status: 429, codigo: "limite_redefinicao" });
    expect(await prisma.redefinicaoSenha.count()).toBe(0);
  });

  it("sem remetente não gera link e não revela o token", async () => {
    await usuario("marina.senha@exemplo.test");
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      pedirRedefinicaoSenha(
        { email: "marina.senha@exemplo.test" },
        { ip: null, origem: "https://taguaro.exemplo", agora: AGORA, remetente: null, enviar: async () => undefined },
      ),
    ).rejects.toMatchObject({ status: 503, codigo: "remetente_ausente" });
    expect(await prisma.redefinicaoSenha.count()).toBe(0);
    expect(erro.mock.calls.flat().join(" ")).not.toMatch(/token=/);
    erro.mockRestore();
  });

  it("se o envio falha, descarta o link e responde como se tivesse enviado", async () => {
    await usuario("marina.senha@exemplo.test");
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resposta = await pedirRedefinicaoSenha(
      { email: "marina.senha@exemplo.test" },
      {
        ip: null,
        origem: "https://taguaro.exemplo",
        agora: AGORA,
        remetente: REMETENTE,
        enviar: async () => {
          throw new Error("rede");
        },
      },
    );
    expect(resposta.mensagem).toBe(MENSAGEM_REDEFINICAO_ENVIADA);
    expect(await prisma.redefinicaoSenha.count()).toBe(0);
    expect(erro.mock.calls.flat().join(" ")).not.toMatch(/token=/);
    erro.mockRestore();
  });

  it("deixa as páginas novas abertas para quem não entrou", async () => {
    for (const caminho of ["/esqueci-senha", "/redefinir-senha", "/api/auth/esqueci-senha", "/api/auth/redefinir-senha"]) {
      const resposta = await middleware(new NextRequest(`http://127.0.0.1:3000${caminho}`));
      expect(resposta.headers.get("location")).toBeNull();
    }
    const protegida = await middleware(new NextRequest("http://127.0.0.1:3000/clientes"));
    expect(protegida.headers.get("location")).toContain("/login");
  });
});
