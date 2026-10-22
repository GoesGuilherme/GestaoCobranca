import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import type { PapelUsuario } from "@/lib/tipos";
import { prisma } from "@/server/db";
import { criarCliente, excluirCliente, listarClientes } from "./cliente-service";
import {
  atualizarServicoDoCliente,
  criarServicoDoCliente,
  excluirServicoDoCliente,
  listarServicosDoCliente,
} from "./cliente-servico-service";
import { obterPainel } from "./painel-service";
import {
  atualizarServico,
  criarServico,
  excluirServico,
  listarServicos,
} from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";

beforeEach(async () => {
  empresaId = (
    await criarEmpresaDeTeste({
      nomeFantasia: "Empresa Serviços",
      cnpj: completarCnpj("560000000001"),
    })
  ).id;
});

function autor(papel: PapelUsuario, outraEmpresa = empresaId) {
  return { empresaId: outraEmpresa, papel };
}

function cliente(documento: string) {
  return {
    nomeFantasia: "Cliente Serviço Teste",
    razaoSocial: "Cliente Serviço Teste Ltda",
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "13988881001",
    email: "ana@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  };
}

function catalogo(nome = "Licença PDVLegal", preco = "189,90") {
  return {
    nome,
    descricao: "Mensalidade de teste.",
    precoPadrao: preco,
    ativo: true,
  };
}

function venda(servicoId: string, extra: Record<string, string> = {}) {
  return {
    servicoId,
    valor: "150,00",
    recorrencia: "MENSAL",
    inicioEm: "2026-04-01",
    status: "ATIVO",
    observacoes: "Valor combinado.",
    ...extra,
  };
}

describe("serviços vendidos", () => {
  it("grava o catálogo em decimal e recusa nome repetido, preço inválido e papel de suporte", async () => {
    await expect(criarServico(autor("SUPORTE"), catalogo())).rejects.toMatchObject({
      status: 403,
      codigo: "sem_permissao",
    });
    expect(await prisma.servico.count()).toBe(0);

    const criado = await criarServico(autor("FINANCEIRO"), {
      ...catalogo(),
      precoPadrao: "1.500,50",
      empresaId: "empresa-do-navegador",
    });
    expect(criado.precoPadrao).toBe("1500.50");
    expect(criado.quantidadeVinculos).toBe(0);
    const linha = await prisma.servico.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.empresaId).toBe(empresaId);
    expect(linha.precoPadrao.toFixed(2)).toBe("1500.50");

    await expect(criarServico(autor("DONO"), catalogo("licença pdvlegal"))).rejects.toMatchObject({
      status: 409,
      codigo: "nome_duplicado",
    });
    await expect(criarServico(autor("DONO"), catalogo("Outro", "-10"))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("guarda o valor combinado sem copiar mudanças do catálogo e soma só o mensal ativo", async () => {
    const servico = await criarServico(autor("DONO"), catalogo());
    const outro = await criarServico(autor("DONO"), catalogo("Implantação", "400,00"));
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("560000000002")));

    const mensal = await criarServicoDoCliente(autor("DONO"), cadastro.id, {
      ...venda(servico.id),
      empresaId: "outra-empresa",
    });
    expect(mensal.valor).toBe("150.00");
    expect(mensal.inicioEm).toBe("2026-04-01");
    expect(mensal.nomeServico).toBe("Licença PDVLegal");
    const gravado = await prisma.clienteServico.findUniqueOrThrow({ where: { id: mensal.id } });
    expect(gravado.empresaId).toBe(empresaId);
    expect(gravado.valor.toFixed(2)).toBe("150.00");

    await criarServicoDoCliente(autor("DONO"), cadastro.id, {
      ...venda(servico.id, { valor: "80,00" }),
    });
    await criarServicoDoCliente(autor("FINANCEIRO"), cadastro.id, {
      ...venda(outro.id, { valor: "400,00", recorrencia: "AVULSO" }),
    });
    const inativo = await criarServicoDoCliente(autor("DONO"), cadastro.id, {
      ...venda(outro.id, { valor: "50,00", status: "INATIVO" }),
    });

    await atualizarServico(autor("DONO"), servico.id, { ...catalogo(), precoPadrao: "999,00" });
    const depois = await listarServicosDoCliente(empresaId, cadastro.id);
    expect(depois.map((item) => item.valor).sort()).toEqual(["150.00", "400.00", "50.00", "80.00"]);
    expect(depois.find((item) => item.id === mensal.id)?.valor).toBe("150.00");

    const [resumo] = await listarClientes(empresaId);
    expect(resumo.valorMensalAtivo).toBe("230.00");
    expect((await obterPainel(empresaId)).receitaMensal).toBe("230.00");

    await atualizarServicoDoCliente(autor("DONO"), inativo.id, {
      ...venda(outro.id, { valor: "50,00", status: "ATIVO", recorrencia: "MENSAL" }),
    });
    expect((await obterPainel(empresaId)).receitaMensal).toBe("280.00");

    await expect(
      criarServicoDoCliente(autor("SUPORTE"), cadastro.id, venda(servico.id)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      atualizarServicoDoCliente(autor("SUPORTE"), mensal.id, venda(servico.id, { valor: "1,00" })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(excluirServicoDoCliente(autor("SUPORTE"), mensal.id)).rejects.toMatchObject({
      status: 403,
    });
    expect((await prisma.clienteServico.findUniqueOrThrow({ where: { id: mensal.id } })).valor.toFixed(2)).toBe(
      "150.00",
    );
  });

  it("não vende serviço inativo, não apaga catálogo em uso e a exclusão do cliente não apaga o catálogo", async () => {
    const servico = await criarServico(autor("DONO"), catalogo());
    await atualizarServico(autor("DONO"), servico.id, { ...catalogo(), ativo: false });
    const cadastro = await criarCliente(empresaId, cliente(completarCnpj("560000000003")));

    await expect(criarServicoDoCliente(autor("DONO"), cadastro.id, venda(servico.id))).rejects.toMatchObject({
      status: 409,
      codigo: "servico_inativo",
    });
    await atualizarServico(autor("DONO"), servico.id, { ...catalogo(), ativo: true });
    const vinculo = await criarServicoDoCliente(autor("DONO"), cadastro.id, venda(servico.id));
    await atualizarServico(autor("DONO"), servico.id, { ...catalogo(), ativo: false });
    const editado = await atualizarServicoDoCliente(autor("DONO"), vinculo.id, {
      ...venda(servico.id, { valor: "175,50" }),
    });
    expect(editado.valor).toBe("175.50");

    await expect(excluirServico(autor("DONO"), servico.id)).rejects.toMatchObject({
      status: 409,
      codigo: "servico_em_uso",
    });
    await expect(criarServicoDoCliente(autor("DONO"), cadastro.id, venda(servico.id, { inicioEm: "2026-02-31" }))).rejects.toMatchObject({
      status: 400,
    });

    await excluirCliente(empresaId, cadastro.id);
    expect(await prisma.clienteServico.count()).toBe(0);
    expect(await listarServicos(empresaId)).toHaveLength(1);

    await excluirServico(autor("FINANCEIRO"), servico.id);
    expect(await listarServicos(empresaId)).toHaveLength(0);
  });
});
