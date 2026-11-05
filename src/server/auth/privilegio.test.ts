import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { completarCnpj } from "@/lib/documento";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { definirConsultaPrivilegioParaTeste, privilegioPorFetch } from "@/server/auth/privilegio-consulta";
import { privilegioDoToken } from "@/server/auth/privilegio";
import { emitirToken, verificarToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "@/server/services/teste-db";

usarBancoDeTeste();

afterEach(() => {
  definirConsultaPrivilegioParaTeste(null);
});

describe("privilégio vivo", () => {
  it("lê o papel do banco e não o que ficou no token", async () => {
    const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Empresa Privilegio", cnpj: completarCnpj("595000000001") });
    const usuario = await prisma.usuario.create({
      data: {
        nome: "Dono Privilegio",
        email: "privilegio@exemplo.test",
        senhaHash: "hash",
        empresaId: empresa.id,
        papel: "DONO",
        superadministrador: true,
      },
    });
    const token = await emitirToken({
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      empresaId: empresa.id,
      papel: "DONO",
      superadministrador: true,
      versaoSessao: 0,
    });
    expect(await privilegioDoToken(token)).toMatchObject({ papel: "DONO", superadministrador: true });
    await prisma.usuario.update({ where: { id: usuario.id }, data: { papel: "SUPORTE", superadministrador: false } });
    expect(await privilegioDoToken(token)).toMatchObject({ papel: "SUPORTE", superadministrador: false });
    expect(await verificarToken(token)).toMatchObject({ superadministrador: true });
  });

  it("o middleware usa o privilégio consultado, não o do token antigo", async () => {
    const token = await emitirToken({
      sub: "usuario-teste",
      email: "velho@exemplo.test",
      nome: "Velho",
      empresaId: "empresa",
      papel: "DONO",
      superadministrador: true,
      versaoSessao: 0,
    });
    definirConsultaPrivilegioParaTeste(async () => ({ papel: "SUPORTE", superadministrador: false }));
    const pedido = new NextRequest("http://127.0.0.1/admin", {
      headers: { cookie: `${COOKIE_SESSAO}=${token}` },
    });
    expect((await middleware(pedido)).status).toBe(403);
  });

  it("trata falha da consulta como sessão anônima", async () => {
    const fetchImpl = async () => {
      throw new Error("rede");
    };
    expect(await privilegioPorFetch("http://127.0.0.1", "gc_sessao=abc", fetchImpl)).toBeNull();
    const negado = async () => new Response(JSON.stringify({ erro: "não" }), { status: 401 });
    expect(await privilegioPorFetch("http://127.0.0.1", "gc_sessao=abc", negado)).toBeNull();
  });
});