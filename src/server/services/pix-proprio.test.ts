import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj, completarCpf } from "@/lib/documento";
import { brCodeValido } from "@/lib/pix-brcode";
import { tokenPublicoValido } from "@/lib/pix-link";
import { prisma } from "@/server/db";
import { alterarFatura } from "./alteracao-fatura-service";
import { emitirFatura } from "./fatura-service";
import { cartaComPix } from "./pix-email";
import { salvarConfiguracaoPix } from "./pix-config-service";
import { cancelarFaturaPix, marcarFaturaPixPaga } from "./pix-cobranca";
import { executarRecorrenciasPix } from "./pix-recorrencia";
import { obterPagamentoPublico, pngPagamentoPublico } from "./pix-publico";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

const chave = () => completarCnpj("112223330001");

function autor(empresaId: string, papel: "DONO" | "FINANCEIRO" | "SUPORTE" = "DONO") {
  return { empresaId, papel, usuarioId: "usuario-teste", email: "dono@exemplo.test", nomeEmpresa: "Padaria" };
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
  return { empresa, vizinha, cliente };
}

describe("Pix por chave própria", () => {
  let empresaId = "";
  let vizinhaId = "";
  let clienteId = "";

  beforeEach(async () => {
    const criado = await preparar();
    empresaId = criado.empresa.id;
    vizinhaId = criado.vizinha.id;
    clienteId = criado.cliente.id;
  });

  it("grava a chave só da própria empresa e liga o provedor", async () => {
    await expect(salvarConfiguracaoPix(autor(empresaId, "SUPORTE"), {})).rejects.toMatchObject({ status: 403 });
    const salva = await salvarConfiguracaoPix(autor(empresaId, "FINANCEIRO"), {
      tipoChave: "CNPJ",
      chavePix: chave(),
      nomeRecebedor: "Padaria do Teste",
      cidadeRecebedor: "Santos",
      usarNasCobrancas: true,
    });
    expect(salva.chavePix).toBe(chave());
    expect(salva.usarNasCobrancas).toBe(true);
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.provedorPagamento).toBe("PIX_DIRETO");
    expect(await prisma.configuracaoPixProprio.count({ where: { empresaId: vizinhaId } })).toBe(0);
  });

  it("emite avulsa, publica só o necessário, altera, cancela e marca como pago", async () => {
    await salvarConfiguracaoPix(autor(empresaId), {
      tipoChave: "EMAIL",
      chavePix: "Financeiro@Empresa.Test",
      nomeRecebedor: "Padaria do Teste",
      cidadeRecebedor: "São Paulo",
      usarNasCobrancas: true,
    });
    const fatura = await emitirFatura(autor(empresaId), clienteId, {
      valor: "150.00",
      vencimento: "2026-12-10",
      formaCobranca: "PIX",
      descricao: "Mensalidade do forno",
    });
    expect(fatura.provedor).toBe("PIX_DIRETO");
    expect(fatura.formaCobranca).toBe("PIX");
    expect(fatura.faturaUrl?.startsWith("/pagar/")).toBe(true);
    expect(brCodeValido(fatura.pixCopiaCola ?? "")).toBe(true);
    expect(fatura.pixCopiaCola).toContain("financeiro@empresa.test");
    expect(fatura.pixCopiaCola).toContain("5406150.00");
    const token = fatura.faturaUrl?.slice("/pagar/".length) ?? "";
    expect(tokenPublicoValido(token)).toBe(true);

    const publico = await obterPagamentoPublico(token, new Date("2026-11-13T15:00:00.000Z"));
    expect(publico).toMatchObject({
      empresa: "Padaria do Teste",
      descricao: "Mensalidade do forno",
      valor: "R$ 150,00",
      status: "Em aberto",
      pagavel: true,
    });
    expect(publico).not.toHaveProperty("empresaId");
    expect(publico).not.toHaveProperty("clienteId");
    expect(JSON.stringify(publico)).not.toContain(empresaId);
    expect(await obterPagamentoPublico("a".repeat(43))).toBeNull();
    const png = await pngPagamentoPublico(token);
    expect(png?.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const carta = await cartaComPix(
      {
        empresa: "Padaria do Teste",
        cliente: "Cliente Pix",
        servico: "Forno",
        valor: "R$ 150,00",
        vencimento: "10/12/2026",
        status: "Em aberto",
        link: fatura.faturaUrl ?? "",
        linhaDigitavel: null,
        pixCopiaCola: fatura.pixCopiaCola,
        logoUrl: null,
        mensagem: "Segue o Pix.",
        modoTeste: false,
      },
      { provedor: "PIX_DIRETO", pixCopiaCola: fatura.pixCopiaCola, tokenPublico: token },
    );
    expect(carta.html).toContain("cid:pix-qr");
    expect(carta.html).toContain("Pagar com Pix");
    expect(carta.html).toContain("financeiro@empresa.test");
    expect(carta.texto).toContain(fatura.pixCopiaCola ?? "");
    expect(carta.anexos[0]?.contentId).toBe("pix-qr");
    expect(carta.html).toContain("https://app.exemplo.test/pagar/");

    const alterada = await alterarFatura(autor(empresaId), fatura.id, {
      valor: "180.00",
      vencimento: "2026-12-20",
      descricao: "Mensalidade ajustada",
    });
    expect(alterada.fatura.valor).toBe("180.00");
    expect(alterada.fatura.faturaUrl).toBe(fatura.faturaUrl);
    expect(alterada.fatura.pixCopiaCola).not.toBe(fatura.pixCopiaCola);
    expect(alterada.fatura.pixCopiaCola).toContain("5406180.00");
    expect(brCodeValido(alterada.fatura.pixCopiaCola ?? "")).toBe(true);

    await expect(marcarFaturaPixPaga(autor(vizinhaId), fatura.id, { pagoEm: "2026-11-13", confirmar: true })).rejects.toMatchObject({
      status: 409,
    });
    await expect(marcarFaturaPixPaga(autor(empresaId, "SUPORTE"), fatura.id, { pagoEm: "2026-11-13", confirmar: true })).rejects.toMatchObject({
      status: 403,
    });
    const paga = await marcarFaturaPixPaga(
      autor(empresaId, "FINANCEIRO"),
      fatura.id,
      { pagoEm: "2026-11-13", nota: "caiu na conta", confirmar: true },
      new Date("2026-11-13T18:00:00.000Z"),
    );
    expect(paga.status).toBe("PAGA");
    expect(paga.pagoEm).toBe("2026-11-13");
    const baixa = await prisma.conciliacaoPagamento.findFirstOrThrow({ where: { faturaId: fatura.id, empresaId } });
    expect(baixa.origem).toBe("MANUAL");
    expect(baixa.nota).toBe("caiu na conta");
    const fila = await prisma.filaWhatsapp.findFirst({ where: { faturaId: fatura.id, tipo: "PAGO" } });
    expect(fila?.tipo).toBe("PAGO");
    const fechado = await obterPagamentoPublico(token, new Date("2026-11-13T18:00:00.000Z"));
    expect(fechado?.status).toBe("Paga");
    expect(fechado?.pagavel).toBe(false);
    expect(fechado?.pixCopiaCola).toBeNull();
    expect(await pngPagamentoPublico(token)).toBeNull();

    const outra = await emitirFatura(autor(empresaId), clienteId, {
      valor: "40.00",
      vencimento: "2026-12-01",
      formaCobranca: "PIX",
    });
    const cancelada = await cancelarFaturaPix(autor(empresaId), outra.id);
    expect(cancelada.excluida).toBe(true);
    expect(cancelada.status).toBe("CANCELADA");
    await expect(emitirFatura(autor(empresaId), clienteId, { valor: "10.00", vencimento: "2026-12-01", formaCobranca: "BOLETO" })).rejects.toMatchObject({
      codigo: "forma_indisponivel",
    });
  });

  it("gera a fatura mensal seguinte com txid e link novos", async () => {
    await salvarConfiguracaoPix(autor(empresaId), {
      tipoChave: "CNPJ",
      chavePix: chave(),
      nomeRecebedor: "Padaria",
      cidadeRecebedor: "Santos",
      usarNasCobrancas: true,
    });
    const servico = await prisma.servico.create({
      data: { empresaId, nome: "Forno", precoPadrao: "90.00" },
    });
    const vinculo = await prisma.clienteServico.create({
      data: {
        empresaId,
        clienteId,
        servicoId: servico.id,
        valor: "90.00",
        recorrencia: "MENSAL",
        inicioEm: new Date("2026-10-01T00:00:00.000Z"),
        status: "ATIVO",
        asaasAssinaturaStatus: "ACTIVE",
        formaCobrancaRecorrente: "PIX",
        diaVencimento: 10,
        proximoVencimento: new Date("2026-11-10T00:00:00.000Z"),
        descricaoRecorrente: "Mensalidade",
      },
    });
    const rodada = await executarRecorrenciasPix({ agora: new Date("2026-11-10T12:00:00.000Z"), empresaId });
    expect(rodada.emitidas).toBe(1);
    const primeira = await prisma.fatura.findFirstOrThrow({ where: { clienteServicoId: vinculo.id } });
    expect(primeira.tokenPublico).toBeTruthy();
    expect(brCodeValido(primeira.pixCopiaCola ?? "")).toBe(true);
    const deNovo = await executarRecorrenciasPix({ agora: new Date("2026-12-10T12:00:00.000Z"), empresaId });
    expect(deNovo.emitidas).toBe(1);
    const faturas = await prisma.fatura.findMany({ where: { clienteServicoId: vinculo.id }, orderBy: { vencimento: "asc" } });
    expect(faturas).toHaveLength(2);
    expect(faturas[0]?.idExterno).not.toBe(faturas[1]?.idExterno);
    expect(faturas[0]?.tokenPublico).not.toBe(faturas[1]?.tokenPublico);
    expect(faturas[1]?.faturaUrl?.startsWith("/pagar/")).toBe(true);
  });
});
