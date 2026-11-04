import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { consultaPeriodo, lerFiltroPeriodo } from "@/lib/periodo-faturas";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { listarFaturas } from "./fatura-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const HOJE = "2026-11-04";

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Período", cnpj: completarCnpj("580000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Período", cnpj: completarCnpj("580000000002") })
  ).id;
});

function autor(papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO", id = empresaId) {
  return { empresaId: id, papel };
}

function pessoa(documento: string, nome: string) {
  return {
    nomeFantasia: nome,
    razaoSocial: `${nome} Ltda`,
    documento,
    segmento: "RESTAURANTE" as const,
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: `${nome.toLowerCase().replace(/ /g, ".")}@exemplo.test`,
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

async function fatura(dados: {
  clienteId: string;
  valor: string;
  vencimento: string;
  status: string;
  pagoEm?: string | null;
  empresa?: string;
  visualizada?: boolean;
  excluida?: boolean;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: dados.valor,
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      pagoEm: dados.pagoEm ? new Date(`${dados.pagoEm}T00:00:00.000Z`) : null,
      status: dados.status,
      formaCobranca: "BOLETO",
      visualizada: dados.visualizada ?? false,
      excluida: dados.excluida ?? false,
    },
  });
}

function periodo(valor: string, extra: { por?: string; de?: string; ate?: string } = {}) {
  return consultaPeriodo(lerFiltroPeriodo({ periodo: valor, ...extra }), HOJE);
}

describe("período na lista de faturas", () => {
  it("filtra pelo vencimento, combina com os outros filtros e isola a empresa", async () => {
    await expect(listarFaturas(autor("SUPORTE"), { situacao: "todas", periodo: periodo("mes_atual") })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });

    const mercado = await criarCliente(empresaId, pessoa(completarCnpj("580000000011"), "Mercado Central"));
    const padaria = await criarCliente(empresaId, pessoa(completarCnpj("580000000012"), "Padaria do Cais"));
    const fora = await criarCliente(outraEmpresaId, pessoa(completarCnpj("580000000013"), "Mercado de Fora"));

    const inicio = await fatura({ clienteId: mercado.id, valor: "10.00", vencimento: "2026-11-01", status: "PENDING" });
    const fim = await fatura({
      clienteId: mercado.id,
      valor: "20.00",
      vencimento: "2026-11-30",
      status: "OVERDUE",
      visualizada: true,
    });
    const pagaNoMes = await fatura({
      clienteId: padaria.id,
      valor: "30.00",
      vencimento: "2026-11-15",
      status: "RECEIVED",
      pagoEm: "2026-10-20",
    });
    await fatura({ clienteId: mercado.id, valor: "40.00", vencimento: "2026-10-31", status: "PENDING" });
    await fatura({ clienteId: mercado.id, valor: "50.00", vencimento: "2026-12-01", status: "PENDING" });
    await fatura({ clienteId: mercado.id, valor: "60.00", vencimento: "2026-11-10", status: "CRIANDO" });
    const cancelada = await fatura({
      clienteId: mercado.id,
      valor: "70.00",
      vencimento: "2026-11-12",
      status: "PENDING",
      excluida: true,
    });
    await fatura({
      clienteId: fora.id,
      valor: "999.00",
      vencimento: "2026-11-10",
      status: "PENDING",
      empresa: outraEmpresaId,
    });

    const abertas = await listarFaturas(autor("FINANCEIRO"), { situacao: "em_aberto", periodo: periodo("mes_atual") });
    expect(abertas.map((item) => item.id).sort()).toEqual([inicio.id, fim.id].sort());

    const todas = await listarFaturas(autor("DONO"), { situacao: "todas", periodo: periodo("mes_atual") });
    expect(todas.map((item) => item.id).sort()).toEqual([inicio.id, fim.id, pagaNoMes.id, cancelada.id].sort());

    const soPadaria = await listarFaturas(autor("DONO"), {
      situacao: "todas",
      busca: "padaria",
      periodo: periodo("mes_atual"),
    });
    expect(soPadaria.map((item) => item.id)).toEqual([pagaNoMes.id]);

    const vistas = await listarFaturas(autor("DONO"), {
      situacao: "em_aberto",
      vista: "vistas",
      periodo: periodo("mes_atual"),
    });
    expect(vistas.map((item) => item.id)).toEqual([fim.id]);

    const pagas = await listarFaturas(autor("DONO"), { situacao: "pagas", periodo: periodo("mes_atual") });
    expect(pagas.map((item) => item.id)).toEqual([pagaNoMes.id]);

    const semCorte = await listarFaturas(autor("DONO"), { situacao: "em_aberto" });
    expect(semCorte.map((item) => item.vencimento).sort()).toEqual(["2026-10-31", "2026-11-01", "2026-11-30", "2026-12-01"]);

    expect(await listarFaturas(autor("DONO", outraEmpresaId), { situacao: "todas", periodo: periodo("mes_atual") })).toHaveLength(1);
  });

  it("filtra pelo pagamento e pelos atalhos de período", async () => {
    const ana = await criarCliente(empresaId, pessoa(completarCnpj("580000000021"), "Ana Mercado"));
    const pagaEmNovembro = await fatura({
      clienteId: ana.id,
      valor: "10.00",
      vencimento: "2026-10-02",
      status: "RECEIVED",
      pagoEm: "2026-11-02",
    });
    const pagaEmOutubro = await fatura({
      clienteId: ana.id,
      valor: "20.00",
      vencimento: "2026-11-20",
      status: "RECEIVED",
      pagoEm: "2026-10-28",
    });
    await fatura({ clienteId: ana.id, valor: "30.00", vencimento: "2026-11-18", status: "PENDING" });
    const bordaTrinta = await fatura({ clienteId: ana.id, valor: "40.00", vencimento: "2026-10-06", status: "PENDING" });
    const antesDaJanela = await fatura({ clienteId: ana.id, valor: "50.00", vencimento: "2026-10-05", status: "PENDING" });
    const dezembro = await fatura({ clienteId: ana.id, valor: "60.00", vencimento: "2026-12-15", status: "PENDING" });

    const porPagamento = await listarFaturas(autor(), {
      situacao: "todas",
      periodo: periodo("mes_atual", { por: "pagamento" }),
    });
    expect(porPagamento.map((item) => item.id)).toEqual([pagaEmNovembro.id]);

    const outubro = await listarFaturas(autor(), {
      situacao: "todas",
      periodo: periodo("mes_anterior", { por: "pagamento" }),
    });
    expect(outubro.map((item) => item.id)).toEqual([pagaEmOutubro.id]);

    const trinta = await listarFaturas(autor(), { situacao: "em_aberto", periodo: periodo("ultimos_30") });
    expect(trinta.map((item) => item.id)).toEqual([bordaTrinta.id]);

    const proximo = await listarFaturas(autor(), { situacao: "em_aberto", periodo: periodo("proximo_mes") });
    expect(proximo.map((item) => item.id)).toEqual([dezembro.id]);

    const personalizado = await listarFaturas(autor(), {
      situacao: "todas",
      periodo: periodo("personalizado", { de: "2026-11-30", ate: "2026-11-02" }),
    });
    expect(personalizado.map((item) => item.vencimento).sort()).toEqual(["2026-11-18", "2026-11-20"]);

    const soAte = await listarFaturas(autor(), {
      situacao: "em_aberto",
      periodo: periodo("personalizado", { ate: "2026-10-06" }),
    });
    expect(soAte.map((item) => item.id).sort()).toEqual([antesDaJanela.id, bordaTrinta.id].sort());
  });
});
