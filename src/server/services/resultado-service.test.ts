import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { destinoAbaResultado } from "@/lib/rotas-dashboard";
import { middleware } from "@/middleware";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { emitirToken } from "@/server/auth/token";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { criarServicoDoCliente } from "./cliente-servico-service";
import { obterResultado } from "./resultado-service";
import { criarServico } from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";

beforeEach(async () => {
  empresaId = (
    await criarEmpresaDeTeste({
      nomeFantasia: "Empresa Resultado",
      cnpj: completarCnpj("560000000011"),
    })
  ).id;
});

function dono(outra = empresaId) {
  return { empresaId: outra, papel: "DONO" as const };
}

function cliente(documento: string, nome: string, status = "ATIVO") {
  return {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status,
  };
}

describe("resultado custo x faturamento", () => {
  it("recusa financeiro e suporte e soma só o que entra no resultado", async () => {
    await expect(obterResultado({ empresaId, papel: "FINANCEIRO" })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    await expect(obterResultado({ empresaId, papel: "SUPORTE" })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    expect(await prisma.clienteServico.count()).toBe(0);

    const licenca = await criarServico(dono(), {
      nome: "Licença",
      precoPadrao: "200,00",
      aliquotaImposto: "5",
      ativo: true,
    });
    const suporte = await criarServico(dono(), {
      nome: "Suporte",
      precoPadrao: "189,90",
      aliquotaImposto: "5",
      ativo: true,
    });
    const certificado = await criarServico(dono(), {
      nome: "Certificado",
      precoPadrao: "100,00",
      ativo: true,
    });

    const ativo = await criarCliente(empresaId, cliente(completarCnpj("560000000012"), "Cliente Ativo"));
    const implantacao = await criarCliente(
      empresaId,
      cliente(completarCnpj("560000000013"), "Cliente Implantação", "EM_IMPLANTACAO"),
    );
    const inativo = await criarCliente(
      empresaId,
      cliente(completarCnpj("560000000014"), "Cliente Inativo", "INATIVO"),
    );

    await criarServicoDoCliente(dono(), ativo.id, {
      servicoId: licenca.id,
      valor: "200,00",
      custo: "50,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-01",
      status: "ATIVO",
    });
    await criarServicoDoCliente(dono(), ativo.id, {
      servicoId: suporte.id,
      valor: "189,90",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-01",
      status: "ATIVO",
    });
    await criarServicoDoCliente(dono(), ativo.id, {
      servicoId: certificado.id,
      valor: "100,00",
      custo: "20,00",
      recorrencia: "AVULSO",
      inicioEm: "2026-04-02",
      status: "ATIVO",
    });
    await criarServicoDoCliente(dono(), ativo.id, {
      servicoId: licenca.id,
      valor: "80,00",
      custo: "10,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-03",
      status: "INATIVO",
    });
    await criarServicoDoCliente(dono(), implantacao.id, {
      servicoId: certificado.id,
      valor: "10,00",
      custo: "30,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-04",
      status: "ATIVO",
    });
    await criarServicoDoCliente(dono(), inativo.id, {
      servicoId: licenca.id,
      valor: "500,00",
      custo: "1,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-05",
      status: "ATIVO",
    });

    const resultado = await obterResultado(dono());
    expect(resultado.mensal).toMatchObject({
      faturamento: "399.90",
      custo: "80.00",
      impostos: "19.50",
      margem: "300.40",
      margemPercentual: "75.12",
      quantidade: 3,
      semCusto: 1,
    });
    expect(resultado.mensal.clientesSemCusto).toEqual([{ id: ativo.id, nome: "Cliente Ativo" }]);
    expect(resultado.mensal.porCliente.map((linha) => linha.nome)).toEqual([
      "Cliente Ativo",
      "Cliente Implantação",
    ]);
    const ativoMensal = resultado.mensal.porCliente[0];
    expect(ativoMensal).toMatchObject({
      faturamento: "389.90",
      custo: "50.00",
      impostos: "19.50",
      margem: "320.40",
      margemPercentual: "82.17",
      semCusto: 1,
    });
    expect(resultado.mensal.porCliente[1]).toMatchObject({
      faturamento: "10.00",
      custo: "30.00",
      impostos: "0.00",
      margem: "-20.00",
      margemPercentual: "-200.00",
    });
    expect(resultado.mensal.porServico.find((linha) => linha.nome === "Licença")).toMatchObject({
      faturamento: "200.00",
      custo: "50.00",
      impostos: "10.00",
      margem: "140.00",
      margemPercentual: "70.00",
    });
    expect(resultado.avulso).toMatchObject({
      faturamento: "100.00",
      custo: "20.00",
      impostos: "0.00",
      margem: "80.00",
      margemPercentual: "80.00",
      quantidade: 1,
      semCusto: 0,
    });
    expect(resultado.avulso.porCliente).toHaveLength(1);
    expect(resultado.mensal.porCliente.some((linha) => linha.nome === "Cliente Inativo")).toBe(false);

    const outra = await criarEmpresaDeTeste({
      nomeFantasia: "Outra Empresa",
      cnpj: completarCnpj("560000000015"),
    });
    const vazio = await obterResultado(dono(outra.id));
    expect(vazio.mensal).toMatchObject({
      faturamento: "0.00",
      custo: "0.00",
      impostos: "0.00",
      margem: "0.00",
      margemPercentual: null,
      quantidade: 0,
      semCusto: 0,
      porCliente: [],
      porServico: [],
    });
    expect(vazio.avulso.quantidade).toBe(0);
  });

  it("só o dono entra na aba e o endereço antigo preserva a query", async () => {
    async function token(papel: "DONO" | "FINANCEIRO" | "SUPORTE") {
      return emitirToken({
        sub: `usuario-${papel.toLowerCase()}`,
        email: `${papel.toLowerCase()}@exemplo.test`,
        nome: papel,
        empresaId,
        papel,
        superadministrador: false,
      });
    }

    const financeiro = await token("FINANCEIRO");
    const suporte = await token("SUPORTE");
    const donoToken = await token("DONO");
    for (const caminho of ["/resultado?aba=1", "/dashboards/resultado", "/api/resultado"]) {
      expect(
        (await middleware(new NextRequest(`http://127.0.0.1${caminho}`, { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }))).status,
      ).toBe(403);
      expect(
        (await middleware(new NextRequest(`http://127.0.0.1${caminho}`, { headers: { cookie: `${COOKIE_SESSAO}=${suporte}` } }))).status,
      ).toBe(403);
    }
    expect(
      (await middleware(new NextRequest("http://127.0.0.1/resultado?visao=mensal", { headers: { cookie: `${COOKIE_SESSAO}=${donoToken}` } }))).status,
    ).toBe(200);
    expect(
      (await middleware(new NextRequest("http://127.0.0.1/dashboards/resultado", { headers: { cookie: `${COOKIE_SESSAO}=${donoToken}` } }))).status,
    ).toBe(200);
    expect(
      (await middleware(new NextRequest("http://127.0.0.1/dashboards/painel", { headers: { cookie: `${COOKIE_SESSAO}=${financeiro}` } }))).status,
    ).toBe(200);
    expect(destinoAbaResultado({ visao: "mensal" })).toBe("/dashboards/resultado?visao=mensal");
    expect(destinoAbaResultado({})).toBe("/dashboards/resultado");
  });
});
