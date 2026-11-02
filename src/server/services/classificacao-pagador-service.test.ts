import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { prisma } from "@/server/db";
import { classificarPagadoresDaEmpresa } from "./classificacao-pagador-service";
import { criarCliente } from "./cliente-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const HOJE = "2026-11-01";

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Selo", cnpj: completarCnpj("630000000001") })).id;
  outraEmpresaId = (
    await criarEmpresaDeTeste({ nomeFantasia: "Outra Selo", cnpj: completarCnpj("630000000002") })
  ).id;
});

function dadosCliente(documento: string, nome: string) {
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
  empresa?: string;
  clienteId: string;
  vencimento: string;
  pagoEm?: string | null;
  status?: string;
  excluida?: boolean;
}) {
  return prisma.fatura.create({
    data: {
      empresaId: dados.empresa ?? empresaId,
      clienteId: dados.clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor: "100.00",
      vencimento: new Date(`${dados.vencimento}T00:00:00.000Z`),
      pagoEm: dados.pagoEm ? new Date(`${dados.pagoEm}T00:00:00.000Z`) : null,
      status: dados.status ?? "RECEIVED",
      formaCobranca: "BOLETO",
      excluida: dados.excluida ?? false,
    },
  });
}

describe("classificação por empresa", () => {
  it("não vaza fatura de outra empresa e devolve o selo de quem tem histórico", async () => {
    const ana = await criarCliente(empresaId, dadosCliente(completarCnpj("630000000011"), "Ana Pontual"));
    const bruno = await criarCliente(outraEmpresaId, dadosCliente(completarCnpj("630000000012"), "Bruno Atraso"));
    await fatura({ clienteId: ana.id, vencimento: "2026-08-10", pagoEm: "2026-08-10" });
    await fatura({ clienteId: ana.id, vencimento: "2026-09-10", pagoEm: "2026-09-10" });
    await fatura({ clienteId: ana.id, vencimento: "2026-10-10", pagoEm: "2026-10-10" });
    await fatura({
      empresa: outraEmpresaId,
      clienteId: bruno.id,
      vencimento: "2026-10-01",
      status: "OVERDUE",
      pagoEm: null,
    });
    await fatura({
      empresa: outraEmpresaId,
      clienteId: bruno.id,
      vencimento: "2026-10-15",
      status: "OVERDUE",
      pagoEm: null,
    });

    const daEmpresa = await classificarPagadoresDaEmpresa(empresaId, [ana.id, bruno.id], HOJE);
    expect(daEmpresa.get(ana.id)?.classificacao).toBe("bom");
    expect(daEmpresa.get(bruno.id)).toBeNull();

    const daOutra = await classificarPagadoresDaEmpresa(outraEmpresaId, [ana.id, bruno.id], HOJE);
    expect(daOutra.get(ana.id)).toBeNull();
    expect(daOutra.get(bruno.id)?.classificacao).toBe("mau");
  });

  it("lê a data de pagamento gravada e explica o pagador regular", async () => {
    const paulo = await criarCliente(empresaId, dadosCliente(completarCnpj("630000000013"), "Paulo Regular"));
    const meses = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];
    for (const [indice, mes] of meses.entries()) {
      const atrasou = indice >= 7;
      await fatura({
        clienteId: paulo.id,
        vencimento: `2026-${mes}-10`,
        pagoEm: atrasou ? `2026-${mes}-16` : `2026-${mes}-10`,
      });
    }
    await fatura({
      clienteId: paulo.id,
      vencimento: "2026-06-01",
      pagoEm: "2026-07-20",
      status: "REFUNDED",
    });

    const mapa = await classificarPagadoresDaEmpresa(empresaId, [paulo.id], HOJE);
    const selo = mapa.get(paulo.id);
    expect(selo?.classificacao).toBe("regular");
    expect(selo?.tooltip).toBe("3 de 10 faturas com atraso, média 6 dias.");
    expect(await classificarPagadoresDaEmpresa(empresaId, [], HOJE)).toEqual(new Map());
  });
});
