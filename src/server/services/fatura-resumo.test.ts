import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { somarDinheiro } from "@/lib/dinheiro";
import { prisma } from "@/server/db";
import { criarCliente } from "./cliente-service";
import { listarFaturas, listarFaturasDaTela } from "./fatura-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";
let outraEmpresaId = "";

beforeEach(async () => {
  empresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Empresa Resumo", cnpj: completarCnpj("590000000001") })).id;
  outraEmpresaId = (await criarEmpresaDeTeste({ nomeFantasia: "Outra Resumo", cnpj: completarCnpj("590000000002") })).id;
});

function autor(papel: "DONO" | "SUPORTE" = "DONO", id = empresaId) {
  return { empresaId: id, papel };
}

describe("agregação das faturas filtradas", () => {
  it("soma e conta além das 200 da lista, no escopo da empresa", async () => {
    await expect(listarFaturasDaTela(autor("SUPORTE"), { situacao: "todas" })).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });

    const padaria = await criarCliente(empresaId, {
      nomeFantasia: "Padaria do Resumo",
      razaoSocial: "Padaria do Resumo Ltda",
      documento: completarCnpj("590000000011"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana Exemplo",
      whatsapp: "13988881001",
      email: "padaria.resumo@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });
    const fora = await criarCliente(outraEmpresaId, {
      nomeFantasia: "Padaria de Fora",
      razaoSocial: "Padaria de Fora Ltda",
      documento: completarCnpj("590000000012"),
      segmento: "RESTAURANTE",
      contatoNome: "Ana Exemplo",
      whatsapp: "13988881002",
      email: "fora.resumo@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    });

    await prisma.fatura.createMany({
      data: [
        ...Array.from({ length: 201 }, (_, indice) => ({
          empresaId,
          clienteId: padaria.id,
          asaasPaymentId: `aberto_${indice}_${randomBytes(2).toString("hex")}`,
          valor: "1.00",
          vencimento: new Date("2026-12-10T00:00:00.000Z"),
          status: "PENDING",
          formaCobranca: "BOLETO",
        })),
        ...Array.from({ length: 2 }, (_, indice) => ({
          empresaId,
          clienteId: padaria.id,
          asaasPaymentId: `vencida_${indice}_${randomBytes(2).toString("hex")}`,
          valor: "10.50",
          vencimento: new Date("2026-10-05T00:00:00.000Z"),
          status: "OVERDUE",
          formaCobranca: "BOLETO",
        })),
        {
          empresaId,
          clienteId: padaria.id,
          asaasPaymentId: `paga_${randomBytes(2).toString("hex")}`,
          valor: "7.00",
          vencimento: new Date("2026-08-01T00:00:00.000Z"),
          pagoEm: new Date("2026-08-02T00:00:00.000Z"),
          status: "RECEIVED",
          formaCobranca: "BOLETO",
        },
        {
          empresaId,
          clienteId: padaria.id,
          asaasPaymentId: `cancelada_${randomBytes(2).toString("hex")}`,
          valor: "100.00",
          vencimento: new Date("2026-09-01T00:00:00.000Z"),
          status: "PENDING",
          formaCobranca: "BOLETO",
          excluida: true,
        },
        {
          empresaId: outraEmpresaId,
          clienteId: fora.id,
          asaasPaymentId: `vizinha_${randomBytes(2).toString("hex")}`,
          valor: "9999.00",
          vencimento: new Date("2026-12-10T00:00:00.000Z"),
          status: "PENDING",
          formaCobranca: "BOLETO",
        },
      ],
    });

    const tela = await listarFaturasDaTela(autor(), { situacao: "em_aberto", busca: "Padaria" });
    expect(tela.faturas).toHaveLength(200);
    expect(await listarFaturas(autor(), { situacao: "em_aberto", busca: "Padaria" })).toHaveLength(200);
    expect(tela.resumo.quantidade).toBe(203);
    expect(tela.resumo.total).toBe("222.00");
    expect(tela.resumo.grupos).toEqual([
      { tom: "aberto", rotulo: "Em aberto", quantidade: 201, total: "201.00" },
      { tom: "vencida", rotulo: "Vencidas", quantidade: 2, total: "21.00" },
    ]);
    expect(somarDinheiro(tela.resumo.grupos.map((grupo) => grupo.total))).toBe(tela.resumo.total);

    const todas = await listarFaturasDaTela(autor(), { situacao: "todas" });
    expect(todas.resumo.quantidade).toBe(205);
    expect(todas.resumo.total).toBe("329.00");

    const pagas = await listarFaturasDaTela(autor(), { situacao: "pagas" });
    expect(pagas.resumo).toMatchObject({ quantidade: 1, total: "7.00" });

    const vizinha = await listarFaturasDaTela(autor("DONO", outraEmpresaId), { situacao: "em_aberto" });
    expect(vizinha.resumo).toMatchObject({ quantidade: 1, total: "9999.00" });
  });
});
