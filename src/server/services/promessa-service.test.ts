import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import { isoDeData } from "@/lib/data";
import type { PapelUsuario } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { clienteResendMemoria } from "@/server/regua/resend";
import { classificarPagadoresDaEmpresa } from "./classificacao-pagador-service";
import { criarCliente } from "./cliente-service";
import { obterMetricasPromessas, obterResumoPromessasPainel } from "./promessa-service";
import {
  cancelarPromessa,
  conciliarPromessas,
  editarPromessa,
  registrarPromessa,
  salvarAjusteSeloPromessa,
} from "./promessa-service";
import { executarRegua } from "./regua-job";
import { atualizarRegua, obterPainelRegua, salvarConfiguracaoRegua } from "./regua-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
usarBancoDeTeste();

const AGORA = new Date("2026-11-03T15:00:00.000Z");
const DIA_SEGUINTE = new Date("2026-11-04T15:00:00.000Z");
const CHAVE = "re_teste_local_nao_enviar_0001";

let empresaId = "";
let outraEmpresaId = "";
let usuarioId = "";
let outroUsuarioId = "";

beforeAll(() => {
  process.env.ASAAS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

beforeEach(async () => {
  const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Empresa Promessa", cnpj: completarCnpj("593000000001") });
  const outra = await criarEmpresaDeTeste({ nomeFantasia: "Outra Promessa", cnpj: completarCnpj("593000000002") });
  empresaId = empresa.id;
  outraEmpresaId = outra.id;
  usuarioId = (
    await prisma.usuario.create({
      data: {
        nome: "Dono Promessa",
        email: `dono-${empresaId}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId,
        papel: "DONO",
      },
    })
  ).id;
  outroUsuarioId = (
    await prisma.usuario.create({
      data: {
        nome: "Dono Outra",
        email: `dono-${outraEmpresaId}@exemplo.test`,
        senhaHash: "hash-teste",
        empresaId: outraEmpresaId,
        papel: "DONO",
      },
    })
  ).id;
});

function autor(papel: PapelUsuario, id = empresaId, usuario = usuarioId) {
  return {
    empresaId: id,
    papel,
    usuarioId: usuario,
    email: `pessoa-${papel.toLowerCase()}@exemplo.test`,
    nomeEmpresa: "Empresa Promessa",
  };
}

function pessoa(documento: string) {
  return {
    nomeFantasia: "Cliente da Promessa",
    razaoSocial: "Cliente da Promessa Ltda",
    documento,
    segmento: "RESTAURANTE" as const,
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "cliente.promessa@exemplo.test",
    cidade: "Santos",
    uf: "SP",
    status: "ATIVO" as const,
  };
}

async function abrirFatura(clienteId: string, vencimento = "2026-11-03", valor = "150.00", status = "PENDING") {
  return prisma.fatura.create({
    data: {
      empresaId,
      clienteId,
      asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
      valor,
      vencimento: new Date(`${vencimento}T00:00:00.000Z`),
      status,
      formaCobranca: "BOLETO",
      boletoUrl: "https://exemplo.test/cobranca",
      descricao: "Serviço exemplo",
    },
  });
}

async function ligarRegua() {
  await salvarConfiguracaoRegua(autor("DONO"), {
    ativa: true,
    modoTeste: true,
    remetenteNome: "Empresa Promessa",
    remetenteEmail: "cobranca@exemplo.test",
    replyTo: "financeiro@exemplo.test",
    chaveResend: CHAVE,
  });
  const painel = await obterPainelRegua(autor("DONO"));
  const regua = painel.reguas[0];
  await atualizarRegua(autor("DONO"), regua.id, {
    nome: regua.nome,
    padrao: true,
    horaInicio: 8,
    horaFim: 18,
    enviarFimDeSemana: false,
    passos: [
      {
        id: regua.passos[0]?.id,
        naEmissao: false,
        dias: 0,
        canal: "EMAIL",
        assunto: "Vence hoje",
        corpo: "Olá, {cliente}.",
        enviarWhatsapp: false,
      },
    ],
  });
}

describe("promessa de pagamento", () => {
  it("a migration só acrescenta tabela e não apaga índice", async () => {
    const sql = readFileSync("prisma/migrations/20261103020000_promessas_pagamento/migration.sql", "utf8");
    expect(sql.toLowerCase().includes("drop index")).toBe(false);
    expect(sql.toLowerCase().includes("drop table")).toBe(false);
    expect(sql).toContain("promessas_pagamento_empresa_id_idx");
    expect(sql).toContain("promessas_pagamento_fatura_id_idx");
    expect(sql).toContain("promessas_pagamento_status_idx");
    expect(sql).toContain("promessas_pagamento_data_prometida_idx");
    expect(sql).toContain("promessas_pendente_por_fatura");
    const linhas = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'faturas_criando_por_cliente'
    `;
    expect(linhas[0]?.indexdef).toContain("CRIANDO");
  });

  it("registra, edita e cancela só enquanto está pendente, e isola a empresa", async () => {
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("593000000011")));
    const fatura = await abrirFatura(cliente.id, "2026-11-10", "200.00");
    await expect(registrarPromessa(autor("SUPORTE"), fatura.id, { dataPrometida: "2026-11-10", valorPrometido: "200.00", canal: "WHATSAPP" }, AGORA)).rejects.toMatchObject({
      status: 403,
    });

    const criada = await registrarPromessa(
      autor("FINANCEIRO"),
      fatura.id,
      { dataPrometida: "2026-11-10", valorPrometido: "80.00", canal: "TELEFONE", observacao: "Paga metade" },
      AGORA,
    );
    expect(criada.status).toBe("PENDENTE");
    expect(criada.valorPrometido).toBe("80.00");
    expect(criada.registradaPor).toBe("Dono Promessa");

    await expect(
      registrarPromessa(autor("DONO"), fatura.id, { dataPrometida: "2026-11-11", valorPrometido: "10.00", canal: "EMAIL" }, AGORA),
    ).rejects.toMatchObject({ codigo: "promessa_pendente" });
    await expect(
      registrarPromessa(autor("DONO"), fatura.id, { dataPrometida: "2026-11-02", valorPrometido: "10.00", canal: "EMAIL" }, AGORA),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      registrarPromessa(autor("DONO", outraEmpresaId, outroUsuarioId), fatura.id, { dataPrometida: "2026-11-12", valorPrometido: "10.00", canal: "EMAIL" }, AGORA),
    ).rejects.toMatchObject({ status: 404 });

    const editada = await editarPromessa(
      autor("DONO"),
      criada.id,
      { dataPrometida: "2026-11-12", valorPrometido: "200.00", canal: "PRESENCIAL", observacao: "" },
      AGORA,
    );
    expect(editada.dataPrometida).toBe("2026-11-12");
    expect(editada.canal).toBe("PRESENCIAL");
    await expect(editarPromessa(autor("DONO", outraEmpresaId, outroUsuarioId), criada.id, { dataPrometida: "2026-11-12", valorPrometido: "10.00", canal: "OUTRO" }, AGORA)).rejects.toMatchObject({
      status: 404,
    });

    const cancelada = await cancelarPromessa(autor("FINANCEIRO"), criada.id);
    expect(cancelada.status).toBe("CANCELADA");
    await expect(editarPromessa(autor("DONO"), criada.id, { dataPrometida: "2026-11-12", valorPrometido: "10.00", canal: "OUTRO" }, AGORA)).rejects.toMatchObject({
      codigo: "promessa_encerrada",
    });
  });

  it("pausa a régua enquanto a promessa vale e volta a enviar quando ela quebra", async () => {
    await ligarRegua();
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("593000000021")));
    const coberta = await abrirFatura(cliente.id, "2026-11-03");
    const livre = await abrirFatura(cliente.id, "2026-11-03");
    await registrarPromessa(
      autor("DONO"),
      coberta.id,
      { dataPrometida: "2026-11-03", valorPrometido: "150.00", canal: "WHATSAPP" },
      AGORA,
    );
    const caixa = clienteResendMemoria();

    const pausada = await executarRegua({ agora: AGORA, empresaId, resend: caixa });
    expect(caixa.caixa).toHaveLength(1);
    expect(caixa.caixa[0]?.para).toBe(`dono-${empresaId}@exemplo.test`);
    expect(pausada.enviados).toBe(1);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: coberta.id, motivo: "promessa de pagamento" } })).toBe(1);
    expect(await prisma.lembreteRegua.count({ where: { faturaId: livre.id, status: "ENVIADO" } })).toBe(1);

    const painel = await obterPainelRegua(autor("DONO"));
    const regua = painel.reguas[0];
    await atualizarRegua(autor("DONO"), regua.id, {
      nome: regua.nome,
      padrao: true,
      horaInicio: 8,
      horaFim: 18,
      enviarFimDeSemana: false,
      passos: [
        {
          id: regua.passos[0]?.id,
          naEmissao: false,
          dias: 1,
          canal: "EMAIL",
          assunto: "Um dia depois",
          corpo: "Olá, {cliente}.",
          enviarWhatsapp: false,
        },
      ],
    });
    await prisma.fatura.updateMany({
      where: { id: { in: [coberta.id, livre.id] } },
      data: { status: "RECEIVED", pagoEm: new Date("2026-11-03T00:00:00.000Z") },
    });
    const depois = await abrirFatura(cliente.id, "2026-11-03");
    await registrarPromessa(
      autor("DONO"),
      depois.id,
      { dataPrometida: "2026-11-03", valorPrometido: "150.00", canal: "EMAIL" },
      AGORA,
    );
    const antes = caixa.caixa.length;
    await executarRegua({ agora: DIA_SEGUINTE, empresaId, resend: caixa });
    expect(caixa.caixa.length).toBe(antes + 1);
    const quebrada = await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId: depois.id } });
    expect(quebrada.status).toBe("QUEBRADA");
    expect(quebrada.quebradaEm ? isoDeData(quebrada.quebradaEm) : null).toBe("2026-11-04");
  });

  it("marca cumprida no prazo, cumprida com atraso depois, e quebra sem pagamento", async () => {
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("593000000031")));
    const noPrazo = await abrirFatura(cliente.id, "2026-11-01", "100.00", "OVERDUE");
    const atrasada = await abrirFatura(cliente.id, "2026-10-01", "40.00", "OVERDUE");
    const semPagamento = await abrirFatura(cliente.id, "2026-11-01", "10.00", "OVERDUE");
    const daOutra = await prisma.fatura.create({
      data: {
        empresaId: outraEmpresaId,
        clienteId: (await criarCliente(outraEmpresaId, pessoa(completarCnpj("593000000032")))).id,
        asaasPaymentId: `pay_${randomBytes(4).toString("hex")}`,
        valor: "999.00",
        vencimento: new Date("2026-11-01T00:00:00.000Z"),
        status: "OVERDUE",
        formaCobranca: "BOLETO",
      },
    });

    await registrarPromessa(autor("DONO"), noPrazo.id, { dataPrometida: "2026-11-03", valorPrometido: "100.00", canal: "WHATSAPP" }, AGORA);
    await registrarPromessa(autor("DONO"), atrasada.id, { dataPrometida: "2026-11-01", valorPrometido: "40.00", canal: "TELEFONE" }, new Date("2026-11-01T15:00:00.000Z"));
    await registrarPromessa(autor("DONO"), semPagamento.id, { dataPrometida: "2026-11-01", valorPrometido: "10.00", canal: "OUTRO" }, new Date("2026-11-01T15:00:00.000Z"));
    const outraPromessa = await registrarPromessa(
      autor("DONO", outraEmpresaId, outroUsuarioId),
      daOutra.id,
      { dataPrometida: "2026-11-01", valorPrometido: "10.00", canal: "EMAIL" },
      new Date("2026-11-01T15:00:00.000Z"),
    );

    await prisma.fatura.update({
      where: { id: noPrazo.id },
      data: { status: "RECEIVED", pagoEm: new Date("2026-11-03T00:00:00.000Z") },
    });
    await prisma.fatura.update({
      where: { id: atrasada.id },
      data: { status: "RECEIVED", pagoEm: new Date("2026-11-05T00:00:00.000Z") },
    });
    await conciliarPromessas(empresaId, "2026-11-03");

    expect((await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId: noPrazo.id } })).status).toBe("CUMPRIDA");
    expect((await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId: atrasada.id } })).status).toBe("CUMPRIDA_COM_ATRASO");
    expect((await prisma.promessaPagamento.findFirstOrThrow({ where: { faturaId: semPagamento.id } })).status).toBe("QUEBRADA");
    expect((await prisma.promessaPagamento.findFirstOrThrow({ where: { id: outraPromessa.id } })).status).toBe("PENDENTE");

    const resumo = await obterResumoPromessasPainel(empresaId, AGORA);
    expect(resumo.quebradas90).toBe(1);
    expect(resumo.cumpridas90).toBe(2);
    expect(resumo.taxa90).toBe("66.6");
    expect(resumo.recentes).toHaveLength(1);
    expect(resumo.recentes[0]?.faturaId).toBe(semPagamento.id);

    const metricas = await obterMetricasPromessas(autor("FINANCEIRO"), {
      inicio: "2026-11-01",
      fim: "2026-11-30",
      hoje: "2026-11-03",
      forma: null,
      statusCliente: null,
    });
    expect(metricas.cumpridas).toBe(2);
    expect(metricas.quebradas).toBe(1);
    expect(metricas.abertas).toBe(0);

    const daOutraResumo = await obterResumoPromessasPainel(outraEmpresaId, AGORA);
    expect(daOutraResumo.quebradas90).toBe(1);
    expect(daOutraResumo.cumpridas90).toBe(0);
    expect(resumo.quebradas90).toBe(1);
  });

  it("o selo só muda quando a empresa liga o ajuste", async () => {
    const cliente = await criarCliente(empresaId, pessoa(completarCnpj("593000000041")));
    const setembro = await abrirFatura(cliente.id, "2026-09-10", "10.00", "RECEIVED");
    const outubro = await abrirFatura(cliente.id, "2026-10-10", "10.00", "RECEIVED");
    await prisma.fatura.update({ where: { id: setembro.id }, data: { pagoEm: new Date("2026-09-10T00:00:00.000Z") } });
    await prisma.fatura.update({ where: { id: outubro.id }, data: { pagoEm: new Date("2026-10-10T00:00:00.000Z") } });
    const aberta = await abrirFatura(cliente.id, "2026-11-01", "10.00", "OVERDUE");
    await registrarPromessa(
      autor("DONO"),
      aberta.id,
      { dataPrometida: "2026-11-01", valorPrometido: "10.00", canal: "WHATSAPP" },
      new Date("2026-11-01T15:00:00.000Z"),
    );
    await conciliarPromessas(empresaId, "2026-11-03");
    await prisma.fatura.update({ where: { id: aberta.id }, data: { excluida: true } });

    const desligado = await classificarPagadoresDaEmpresa(empresaId, [cliente.id], "2026-11-03");
    expect(desligado.get(cliente.id)?.classificacao).toBe("bom");

    await salvarAjusteSeloPromessa(autor("DONO"), { contarNoSelo: true });
    await expect(salvarAjusteSeloPromessa(autor("FINANCEIRO"), { contarNoSelo: true })).rejects.toMatchObject({ status: 403 });
    const ligado = await classificarPagadoresDaEmpresa(empresaId, [cliente.id], "2026-11-03");
    expect(ligado.get(cliente.id)?.classificacao).toBe("regular");
    expect(ligado.get(cliente.id)?.promessasQuebradas).toBe(1);
  });
});
