import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj, completarCpf } from "@/lib/documento";
import { ofxSgml } from "@/lib/ofx/fixtures";
import { prisma } from "@/server/db";
import { emitirFatura } from "./fatura-service";
import { confirmarSugestaoOfx, ignorarSugestaoOfx, importarExtratoOfx } from "./ofx-conciliacao";
import { salvarConfiguracaoPix } from "./pix-config-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const AGORA = new Date("2026-11-13T18:00:00.000Z");

function autor(empresaId: string, papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO") {
  return { empresaId, papel, usuarioId: "usuario-ofx", email: "dono@exemplo.test", nomeEmpresa: "Padaria" };
}

async function preparar() {
  const empresa = await criarEmpresaDeTeste({ nomeFantasia: "Padaria do Teste", cnpj: completarCnpj("910000000001") });
  const vizinha = await criarEmpresaDeTeste({ nomeFantasia: "Outra", cnpj: completarCnpj("910000000002") });
  const cliente = await prisma.cliente.create({
    data: {
      empresaId: empresa.id,
      nomeFantasia: "Cliente Pix",
      razaoSocial: "Cliente Pix Ltda",
      documento: completarCpf("529982247"),
      tipoDocumento: "CPF",
      contatoNome: "Ana",
      whatsapp: "13988881001",
      email: "ana@exemplo.test",
      cidade: "Santos",
      uf: "SP",
      status: "ATIVO",
    },
  });
  await salvarConfiguracaoPix(autor(empresa.id), {
    tipoChave: "CNPJ",
    chavePix: completarCnpj("112223330001"),
    nomeRecebedor: "Padaria do Teste",
    cidadeRecebedor: "Santos",
    usarNasCobrancas: true,
  });
  return { empresa, vizinha, cliente };
}

function arquivo(linhas: { data: string; valor: string; fitId: string; memo?: string; nome?: string }[], bankId = "341", acctId = "12345-6") {
  const texto = ofxSgml({ org: "ITAU", fid: "341", bankId, acctId, linhas });
  return { nome: "extrato.ofx", conteudo: Buffer.from(texto, "latin1") };
}

describe("importação OFX", () => {
  let empresaId = "";
  let vizinhaId = "";
  let clienteId = "";

  beforeEach(async () => {
    const criado = await preparar();
    empresaId = criado.empresa.id;
    vizinhaId = criado.vizinha.id;
    clienteId = criado.cliente.id;
  });

  it("recusa suporte e não olha fatura de outra empresa", async () => {
    await expect(importarExtratoOfx(autor(empresaId, "SUPORTE"), arquivo([]), AGORA)).rejects.toMatchObject({ status: 403 });
    const daCasa = await emitirFatura(autor(empresaId), clienteId, {
      valor: "150.00",
      vencimento: "2026-12-10",
      formaCobranca: "PIX",
    });
    const clienteVizinho = await prisma.cliente.create({
      data: {
        empresaId: vizinhaId,
        nomeFantasia: "Vizinho",
        razaoSocial: "Vizinho Ltda",
        documento: completarCpf("390533447"),
        tipoDocumento: "CPF",
        contatoNome: "Bia",
        whatsapp: "11988881001",
        email: "bia@exemplo.test",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVO",
      },
    });
    await salvarConfiguracaoPix(autor(vizinhaId), {
      tipoChave: "CNPJ",
      chavePix: completarCnpj("112223330001"),
      nomeRecebedor: "Outra",
      cidadeRecebedor: "Santos",
      usarNasCobrancas: true,
    });
    const doVizinho = await emitirFatura(autor(vizinhaId), clienteVizinho.id, {
      valor: "150.00",
      vencimento: "2026-12-10",
      formaCobranca: "PIX",
    });
    const txid = (await prisma.fatura.findFirstOrThrow({ where: { id: daCasa.id } })).idExterno ?? "";
    await prisma.fatura.update({ where: { id: doVizinho.id }, data: { idExterno: txid } });

    const resumo = await importarExtratoOfx(
      autor(empresaId, "FINANCEIRO"),
      arquivo([{ data: "20261113", valor: "150.00", fitId: "FIT-CASA", memo: `PIX ${txid}` }]),
      AGORA,
    );
    expect(resumo.baixadas).toBe(1);
    const paga = await prisma.fatura.findFirstOrThrow({ where: { id: daCasa.id } });
    expect(paga.status).toBe("PAGA");
    expect(paga.pagoEm?.toISOString().slice(0, 10)).toBe("2026-11-13");
    const baixa = await prisma.conciliacaoPagamento.findFirstOrThrow({ where: { faturaId: daCasa.id, empresaId } });
    expect(baixa.origem).toBe("OFX");
    expect(baixa.usuarioId).toBe("usuario-ofx");
    expect(baixa.referenciaExterna).toContain("FIT-CASA");
    expect(baixa.nota).toContain("extrato.ofx");
    const vizinha = await prisma.fatura.findFirstOrThrow({ where: { id: doVizinho.id } });
    expect(vizinha.status).not.toBe("PAGA");
    expect(await prisma.transacaoOfx.count({ where: { empresaId: vizinhaId } })).toBe(0);
  });

  it("não baixa de novo e respeita a janela do WhatsApp", async () => {
    const recente = await emitirFatura(autor(empresaId), clienteId, {
      valor: "40.00",
      vencimento: "2026-12-01",
      formaCobranca: "PIX",
    });
    const antiga = await emitirFatura(autor(empresaId), clienteId, {
      valor: "41.00",
      vencimento: "2026-12-02",
      formaCobranca: "PIX",
    });
    const txidRecente = (await prisma.fatura.findFirstOrThrow({ where: { id: recente.id } })).idExterno ?? "";
    const txidAntiga = (await prisma.fatura.findFirstOrThrow({ where: { id: antiga.id } })).idExterno ?? "";
    const corpo = arquivo([
      { data: "20261113", valor: "40.00", fitId: "FIT-NOVO", memo: txidRecente },
      { data: "20261101", valor: "41.00", fitId: "FIT-VELHO", memo: txidAntiga },
    ]);
    const resumo = await importarExtratoOfx(autor(empresaId), corpo, AGORA);
    expect(resumo.baixadas).toBe(2);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: recente.id, tipo: "PAGO" } })).toBe(1);
    expect(await prisma.filaWhatsapp.count({ where: { faturaId: antiga.id, tipo: "PAGO" } })).toBe(0);

    const deNovo = await importarExtratoOfx(autor(empresaId), corpo, AGORA);
    expect(deNovo.baixadas).toBe(0);
    expect(deNovo.jaImportadas).toBe(2);
    expect(await prisma.conciliacaoPagamento.count({ where: { empresaId, origem: "OFX" } })).toBe(2);
    expect(await prisma.transacaoOfx.count({ where: { empresaId } })).toBe(2);
  });

  it("guarda sugestão, confirma uma e ignora a outra sem duplicar", async () => {
    const primeira = await emitirFatura(autor(empresaId), clienteId, {
      valor: "75.00",
      vencimento: "2026-12-05",
      formaCobranca: "PIX",
    });
    const segunda = await emitirFatura(autor(empresaId), clienteId, {
      valor: "75.00",
      vencimento: "2026-12-06",
      formaCobranca: "PIX",
    });
    const resumo = await importarExtratoOfx(
      autor(empresaId),
      arquivo([
        { data: "20261113", valor: "75.00", fitId: "FIT-DUVIDA", memo: "PIX SEM IDENTIFICACAO" },
        { data: "20261113", valor: "9.00", fitId: "FIT-NADA", memo: "DEPOSITO AVULSO" },
      ]),
      AGORA,
    );
    expect(resumo.sugestoes).toBe(1);
    expect(resumo.naoIdentificadas).toBe(1);
    const sugestao = await prisma.transacaoOfx.findFirstOrThrow({ where: { empresaId, fitId: "FIT-DUVIDA" } });
    expect(sugestao.situacao).toBe("SUGESTAO");
    await confirmarSugestaoOfx(autor(empresaId, "FINANCEIRO"), sugestao.id, primeira.id, AGORA);
    const paga = await prisma.fatura.findFirstOrThrow({ where: { id: primeira.id } });
    expect(paga.status).toBe("PAGA");
    const baixa = await prisma.conciliacaoPagamento.findFirstOrThrow({ where: { faturaId: primeira.id } });
    expect(baixa.origem).toBe("OFX");
    expect(baixa.referenciaExterna).toContain("FIT-DUVIDA");
    const aberta = await prisma.fatura.findFirstOrThrow({ where: { id: segunda.id } });
    expect(aberta.status).not.toBe("PAGA");

    const outra = await importarExtratoOfx(
      autor(empresaId),
      arquivo([{ data: "20261113", valor: "75.00", fitId: "FIT-OUTRA", memo: "PIX SEM IDENTIFICACAO" }]),
      AGORA,
    );
    expect(outra.sugestoes).toBe(1);
    const pendente = await prisma.transacaoOfx.findFirstOrThrow({ where: { fitId: "FIT-OUTRA", empresaId } });
    await ignorarSugestaoOfx(autor(empresaId), pendente.id);
    const repetida = await importarExtratoOfx(
      autor(empresaId),
      arquivo([{ data: "20261113", valor: "75.00", fitId: "FIT-OUTRA", memo: "PIX SEM IDENTIFICACAO" }]),
      AGORA,
    );
    expect(repetida.sugestoes).toBe(0);
    expect(repetida.jaImportadas).toBe(1);
    expect(await prisma.transacaoOfx.count({ where: { empresaId, fitId: "FIT-OUTRA" } })).toBe(1);
    expect((await prisma.fatura.findFirstOrThrow({ where: { id: segunda.id } })).status).not.toBe("PAGA");
  });
});
