import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MENSAGEM_CNPJ_FALHA,
  MENSAGEM_CNPJ_NAO_ENCONTRADO,
  MENSAGEM_CNPJ_SUCESSO,
  TEXTO_CONSULTANDO_CNPJ,
} from "@/lib/consulta-cnpj";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
  usePathname: () => "/clientes/novo",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { FormularioCliente } from "./formulario-cliente";
import { StatusConsultaCnpj } from "./status-consulta-cnpj";
import { buscarCadastroCnpj } from "./use-consulta-cnpj";

describe("aviso da consulta de CNPJ", () => {
  it("mostra carregamento, sucesso e erro em português", () => {
    const carregando = renderToStaticMarkup(
      createElement(StatusConsultaCnpj, { id: "consulta", estado: { fase: "carregando" } }),
    );
    expect(carregando).toContain(TEXTO_CONSULTANDO_CNPJ);
    expect(carregando).toContain('role="status"');
    expect(carregando).toContain('aria-live="polite"');

    const sucesso = renderToStaticMarkup(
      createElement(StatusConsultaCnpj, {
        id: "consulta",
        estado: { fase: "sucesso", texto: MENSAGEM_CNPJ_SUCESSO },
      }),
    );
    expect(sucesso).toContain(MENSAGEM_CNPJ_SUCESSO);
    expect(sucesso).toContain("Você pode corrigir qualquer campo.");

    const erro = renderToStaticMarkup(
      createElement(StatusConsultaCnpj, {
        id: "consulta",
        estado: { fase: "erro", texto: MENSAGEM_CNPJ_NAO_ENCONTRADO },
      }),
    );
    expect(erro).toContain(MENSAGEM_CNPJ_NAO_ENCONTRADO);
    expect(erro).toContain('role="alert"');

    expect(renderToStaticMarkup(createElement(StatusConsultaCnpj, { id: "consulta", estado: { fase: "ocioso" } }))).toBe("");
  });

  it("mantém os campos que o cadastro de cliente já pedia", () => {
    const html = renderToStaticMarkup(createElement(FormularioCliente, { podeBloquear: true, segmentos: [] }));
    for (const rotulo of [
      "Nome fantasia",
      "Razão social",
      "CPF ou CNPJ",
      "Endereço",
      "Número",
      "Complemento",
      "Bairro",
      "CEP",
      "Cidade",
      "UF",
      "E-mail",
    ]) {
      expect(html).toContain(rotulo);
    }
    expect(html).toContain("Pode colar com ou sem pontuação.");
    expect(html).not.toContain("Inscrição estadual");
    expect(html).not.toContain("Consultando CNPJ");
  });
});

describe("busca pela rota do app", () => {
  it("chama /api/cnpj e não a origem pública", async () => {
    const original = globalThis.fetch;
    let url = "";
    globalThis.fetch = async (entrada) => {
      url = String(entrada);
      return Response.json({
        cnpj: "19131243000197",
        campos: { razaoSocial: "Open Knowledge Brasil", cidade: "São Paulo", uf: "SP" },
      });
    };
    try {
      const resultado = await buscarCadastroCnpj("19131243000197");
      expect(url).toBe("/api/cnpj?cnpj=19131243000197");
      expect(url).not.toContain("brasilapi");
      expect(resultado).toEqual({
        ok: true,
        mensagem: MENSAGEM_CNPJ_SUCESSO,
        campos: { razaoSocial: "Open Knowledge Brasil", cidade: "São Paulo", uf: "SP" },
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("devolve o erro em português e não preenche campos", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json(
        { erro: MENSAGEM_CNPJ_NAO_ENCONTRADO, codigo: "cnpj_nao_encontrado" },
        { status: 404 },
      );
    try {
      const resultado = await buscarCadastroCnpj("19131243000197");
      expect(resultado).toEqual({ ok: false, mensagem: MENSAGEM_CNPJ_NAO_ENCONTRADO, status: 404 });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("esconde detalhe interno quando a rota responde texto longo", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ erro: `falha ${"x".repeat(300)}` }, { status: 502 });
    try {
      const resultado = await buscarCadastroCnpj("19131243000197");
      expect(resultado).toEqual({ ok: false, status: 502, mensagem: MENSAGEM_CNPJ_FALHA });
    } finally {
      globalThis.fetch = original;
    }
  });
});
