import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { obterPainel } from "./painel-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";

beforeEach(async () => {
  const empresa = await criarEmpresaDeTeste({
    nomeFantasia: "Empresa Painel",
    cnpj: completarCnpj("540000000001"),
  });
  empresaId = empresa.id;
});

function cliente(documento: string, extra: Record<string, string> = {}) {
  return {
    nomeFantasia: "Cliente do Painel",
    razaoSocial: "Cliente do Painel Ltda",
    documento,
    contatoNome: "Ana Painel",
    whatsapp: "(13) 98888-1001",
    email: "ana@painel.test",
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO",
    ...extra,
  };
}

describe("painel por segmento da empresa", () => {
  it("agrupa pelo segmento cadastrado e não pelo enum fixo", async () => {
    const padaria = await prisma.segmentoCliente.create({
      data: { empresaId, nome: "Padaria", cor: "#c7922e" },
    });
    await criarCliente(empresaId, cliente(completarCnpj("540000000011"), { segmento: "RESTAURANTE", segmentoId: padaria.id }));
    await criarCliente(
      empresaId,
      cliente(completarCnpj("540000000012"), {
        segmento: "OUTRO",
        segmentoId: padaria.id,
        nomeFantasia: "Outra Padaria",
      }),
    );
    await criarCliente(empresaId, cliente(completarCnpj("540000000013"), { segmento: "MERCADO_AUTONOMO", nomeFantasia: "Sem cadastro" }));

    const outra = await criarEmpresaDeTeste({
      nomeFantasia: "Empresa Vizinha",
      cnpj: completarCnpj("540000000002"),
    });
    const bar = await prisma.segmentoCliente.create({
      data: { empresaId: outra.id, nome: "Bar", cor: "#0b3861" },
    });
    await criarCliente(outra.id, cliente(completarCnpj("540000000021"), { segmentoId: bar.id, nomeFantasia: "Bar Vizinho" }));

    const painel = await obterPainel(empresaId);
    expect(painel.totalClientes).toBe(3);
    expect(painel.porSegmento).toEqual([
      { id: padaria.id, nome: "Padaria", cor: "#c7922e", quantidade: 2 },
      { id: null, nome: "Sem segmento da empresa", cor: null, quantidade: 1 },
    ]);

    const vizinho = await obterPainel(outra.id);
    expect(vizinho.porSegmento).toEqual([{ id: bar.id, nome: "Bar", cor: "#0b3861", quantidade: 1 }]);
    expect(vizinho.totalClientes).toBe(1);
  });

  it("não lista segmento quando a empresa ainda não tem cliente", async () => {
    await prisma.segmentoCliente.create({ data: { empresaId, nome: "Padaria" } });
    expect(await obterPainel(empresaId)).toMatchObject({ totalClientes: 0, porSegmento: [] });
  });
});
