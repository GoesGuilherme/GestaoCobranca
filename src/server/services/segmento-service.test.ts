import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { criarCliente, listarClientes } from "./cliente-service";
import {
  atualizarSegmento,
  criarSegmento,
  criarSugestoesSegmento,
  excluirSegmento,
  listarSegmentos,
  obterSegmento,
} from "./segmento-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (
    await criarEmpresaDeTeste({
      nomeFantasia: "Empresa Segmentos",
      cnpj: completarCnpj("570000000001"),
    })
  ).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({
      nomeFantasia: "Outra Empresa Segmentos",
      cnpj: completarCnpj("570000000002"),
    })
  ).id;
});

function autor(papel: PapelUsuario, id = empresaId) {
  return { empresaId: id, papel };
}

function entrada(nome = "Padaria", extra: Record<string, unknown> = {}) {
  return {
    nome,
    descricao: "Comércio de pão.",
    cor: "#C7922E",
    ativo: true,
    empresaId: "empresa-do-navegador",
    ...extra,
  };
}

function cliente(documento: string, segmentoId?: string) {
  return {
    nomeFantasia: "Cliente do Segmento",
    razaoSocial: "Cliente do Segmento Ltda",
    documento,
    segmento: "OUTRO",
    ...(segmentoId ? { segmentoId } : {}),
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  };
}

describe("segmentos da empresa", () => {
  it("isola por empresa, recusa nome repetido e papel de suporte", async () => {
    await expect(criarSegmento(autor("SUPORTE"), entrada())).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    expect(await prisma.segmentoCliente.count()).toBe(0);

    const criado = await criarSegmento(autor("FINANCEIRO"), entrada());
    expect(criado.nome).toBe("Padaria");
    expect(criado.cor).toBe("#c7922e");
    expect(criado.ativo).toBe(true);
    expect(criado.quantidadeClientes).toBe(0);
    const linha = await prisma.segmentoCliente.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.empresaId).toBe(empresaId);

    await expect(criarSegmento(autor("DONO"), entrada("padaria"))).rejects.toMatchObject({
      status: 409,
      codigo: "nome_duplicado",
    });
    await expect(criarSegmento(autor("DONO"), entrada("X"))).rejects.toMatchObject({ status: 400 });

    const naOutra = await criarSegmento(autor("DONO", outraEmpresaId), entrada("Padaria"));
    expect(naOutra.id).not.toBe(criado.id);
    expect((await listarSegmentos(empresaId)).map((item) => item.id)).toEqual([criado.id]);
    expect((await listarSegmentos(outraEmpresaId)).map((item) => item.id)).toEqual([naOutra.id]);

    await expect(obterSegmento(outraEmpresaId, criado.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      atualizarSegmento(autor("DONO", outraEmpresaId), criado.id, entrada("Mercado")),
    ).rejects.toMatchObject({ status: 404 });
    await expect(excluirSegmento(autor("DONO", outraEmpresaId), criado.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await prisma.segmentoCliente.findUnique({ where: { id: criado.id } })).not.toBeNull();
  });

  it("desativa quando há clientes e exclui quando não há", async () => {
    const padaria = await criarSegmento(autor("DONO"), entrada());
    const lanchonete = await criarSegmento(autor("DONO"), entrada("Lanchonete", { cor: "#051a3a" }));
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("570000000003"), padaria.id));
    expect(cadastro.segmentoId).toBe(padaria.id);
    expect(cadastro.segmentoNome).toBe("Padaria");
    expect(cadastro.segmentoCor).toBe("#c7922e");

    const filtrados = await listarClientes(empresaId, { segmentoId: padaria.id });
    expect(filtrados.map((item) => item.id)).toEqual([cadastro.id]);
    expect(await listarClientes(outraEmpresaId, { segmentoId: padaria.id })).toEqual([]);

    await expect(criarCliente(empresaId, cliente(completarCnpj("570000000004"), "segmento-alheio"))).rejects.toMatchObject({
      status: 400,
      codigo: "segmento_invalido",
    });
    await expect(
      criarCliente(outraEmpresaId, cliente(completarCnpj("570000000005"), padaria.id)),
    ).rejects.toMatchObject({ status: 400, codigo: "segmento_invalido" });

    await expect(
      prisma.cliente.update({
        where: { id: cadastro.id },
        data: { segmentoId: (await criarSegmento(autor("DONO", outraEmpresaId), entrada("Bar"))).id },
      }),
    ).rejects.toThrow(/segmento_outra_empresa/);

    await expect(excluirSegmento(autor("DONO"), padaria.id)).rejects.toMatchObject({
      status: 409,
      codigo: "segmento_em_uso",
    });
    const desativado = await atualizarSegmento(autor("FINANCEIRO"), padaria.id, entrada("Padaria", { ativo: false }));
    expect(desativado.ativo).toBe(false);
    expect(desativado.quantidadeClientes).toBe(1);
    const aindaLigado = await prisma.cliente.findUniqueOrThrow({ where: { id: cadastro.id } });
    expect(aindaLigado.segmentoId).toBe(padaria.id);

    await expect(excluirSegmento(autor("SUPORTE"), lanchonete.id)).rejects.toMatchObject({ status: 403 });
    await excluirSegmento(autor("DONO"), lanchonete.id);
    expect(await prisma.segmentoCliente.findUnique({ where: { id: lanchonete.id } })).toBeNull();
  });

  it("cria as sugestões uma vez por empresa", async () => {
    await expect(criarSugestoesSegmento(autor("SUPORTE"))).rejects.toMatchObject({ status: 403 });
    const primeira = await criarSugestoesSegmento(autor("DONO"));
    expect(primeira.criados).toBe(6);
    const nomes = (await listarSegmentos(empresaId)).map((item) => item.nome);
    expect(nomes).toContain("Restaurante");
    expect(nomes).toContain("Mercado autônomo");
    expect(nomes).toContain("Padaria");
    expect(nomes).toContain("Lanchonete");
    expect(nomes).toContain("Bar");
    expect(nomes).toContain("Outros");

    const segunda = await criarSugestoesSegmento(autor("DONO"));
    expect(segunda.criados).toBe(0);
    expect(await prisma.segmentoCliente.count({ where: { empresaId } })).toBe(6);

    const naOutra = await criarSugestoesSegmento(autor("FINANCEIRO", outraEmpresaId));
    expect(naOutra.criados).toBe(6);
    expect(await prisma.segmentoCliente.count()).toBe(12);
  });
});
