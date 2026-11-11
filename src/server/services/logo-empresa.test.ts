import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as logoPublica } from "@/app/api/publico/logos/[empresaId]/route";
import { MENSAGEM_LOGO_TIPO } from "@/lib/logo";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import type { Acesso } from "@/server/auth/acesso";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { middleware } from "@/middleware";
import { prisma } from "@/server/db";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { gravarLogoEmpresa, lerLogoPublica, removerLogoEmpresa, resumoLogoEmpresa } from "./logo-empresa-service";

usarBancoDeTeste();

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

let empresaId = "";
let outraId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Logo", cnpj: completarCnpj("640000000001") })).id;
  outraId = (await criarEmpresaDeTeste({ nomeFantasia: "Outra Logo", cnpj: completarCnpj("640000000002") })).id;
});

function acesso(id: string, papel: PapelUsuario): Acesso {
  return {
    usuarioId: "usuario-logo",
    nome: "Dono Logo",
    email: "dono.logo@exemplo.test",
    empresaId: id,
    nomeEmpresa: "Empresa Logo",
    cnpjEmpresa: "64000000000100",
    papel,
    superadministrador: false,
  };
}

describe("logo da empresa", () => {
  it("grava, troca e remove só a logo da empresa da sessão", async () => {
    const salva = await gravarLogoEmpresa(acesso(empresaId, "DONO"), PNG);
    expect(salva.temLogo).toBe(true);
    expect(salva.caminho).toContain(`/api/publico/logos/${empresaId}?v=`);
    expect((await resumoLogoEmpresa(outraId)).temLogo).toBe(false);

    await gravarLogoEmpresa(acesso(outraId, "DONO"), JPEG);
    const primeira = await prisma.logoEmpresa.findUniqueOrThrow({ where: { empresaId } });
    expect(primeira.mime).toBe("image/png");
    expect(Buffer.from(primeira.conteudo).subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const publica = await logoPublica(new Request(`http://127.0.0.1/api/publico/logos/${empresaId}`), {
      params: Promise.resolve({ empresaId }),
    });
    expect(publica.status).toBe(200);
    expect(publica.headers.get("content-type")).toBe("image/png");
    expect(publica.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await publica.arrayBuffer()).subarray(0, 4)).toEqual(PNG.subarray(0, 4));

    const alheia = await logoPublica(new Request(`http://127.0.0.1/api/publico/logos/${outraId}`), {
      params: Promise.resolve({ empresaId: outraId }),
    });
    expect(alheia.headers.get("content-type")).toBe("image/jpeg");
    expect((await logoPublica(new Request("http://127.0.0.1/api/publico/logos/.."), {
      params: Promise.resolve({ empresaId: ".." }),
    })).status).toBe(404);

    await removerLogoEmpresa(acesso(empresaId, "DONO"));
    expect((await resumoLogoEmpresa(empresaId)).temLogo).toBe(false);
    expect((await lerLogoPublica(empresaId))).toBeNull();
    expect((await resumoLogoEmpresa(outraId)).temLogo).toBe(true);
  });

  it("recusa outro papel e arquivo que não é png nem jpg", async () => {
    await expect(gravarLogoEmpresa(acesso(empresaId, "FINANCEIRO"), PNG)).rejects.toMatchObject({ status: 403 });
    await expect(gravarLogoEmpresa(acesso(empresaId, "SUPORTE"), PNG)).rejects.toMatchObject({ status: 403 });
    await expect(
      gravarLogoEmpresa(acesso(empresaId, "DONO"), new TextEncoder().encode("<svg></svg>")),
    ).rejects.toMatchObject({ status: 400, message: MENSAGEM_LOGO_TIPO });
    expect(await prisma.logoEmpresa.count({ where: { empresaId } })).toBe(0);
  });

  it("a tela fica com o dono e a imagem pública não pede sessão", async () => {
    const anonimo = await middleware(new NextRequest(`http://127.0.0.1/api/publico/logos/${empresaId}`));
    expect(anonimo.status).toBe(200);

    const semSessao = await middleware(new NextRequest("http://127.0.0.1/emails"));
    expect(semSessao.status).toBe(307);
    expect(semSessao.headers.get("location")).toContain("/login");
    const semSessaoApi = await middleware(new NextRequest("http://127.0.0.1/api/empresa/logo"));
    expect(semSessaoApi.status).toBe(401);

    const financeiro = await emitirToken({
      sub: "usuario-financeiro-logo",
      email: "financeiro.logo@exemplo.test",
      nome: "Financeiro",
      empresaId,
      papel: "FINANCEIRO",
      superadministrador: false,
    });
    const bloqueado = await middleware(
      new NextRequest("http://127.0.0.1/emails", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }),
    );
    expect(bloqueado.status).toBe(403);
    const api = await middleware(
      new NextRequest("http://127.0.0.1/api/empresa/logo", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }),
    );
    expect(api.status).toBe(403);

    const dono = await emitirToken({
      sub: "usuario-dono-logo",
      email: "dono.logo@exemplo.test",
      nome: "Dono",
      empresaId,
      papel: "DONO",
      superadministrador: false,
    });
    const liberado = await middleware(
      new NextRequest("http://127.0.0.1/emails", { headers: { cookie: `${COOKIE_SESSAO}=${dono}` } }),
    );
    expect(liberado.status).toBe(200);
  });
});
