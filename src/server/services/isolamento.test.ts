import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import type { Acesso } from "@/server/auth/acesso";
import { autenticar } from "@/server/auth/entrar";
import { gerarHashSenha } from "@/server/auth/senha";
import { prisma } from "@/server/db";
import {
  atualizarCliente,
  criarCliente,
  excluirCliente,
  listarClientes,
  obterCliente,
} from "./cliente-service";
import {
  alterarStatusEmpresa,
  cadastrarEmpresaPublica,
} from "./empresa-service";
import {
  atualizarFilial,
  criarFilial,
  excluirFilial,
  obterFilial,
} from "./filial-service";
import { obterPainel } from "./painel-service";
import {
  atualizarServicoDoCliente,
  criarServicoDoCliente,
  excluirServicoDoCliente,
  listarServicosDoCliente,
} from "./cliente-servico-service";
import {
  atualizarServico,
  criarServico,
  excluirServico,
  listarServicos,
  obterServico,
} from "./servico-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";
import { criarUsuarioDaEmpresa } from "./usuario-service";

usarBancoDeTeste();

function cliente(documento: string, nome = "Cliente Isolado Teste") {
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
    status: "ATIVO",
  };
}

function filial(cnpj: string) {
  return {
    nome: "FILIAL ISOLADA TESTE",
    cnpj,
    endereco: "Rua Exemplo, 10",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVA",
  };
}

function acessoDe(empresaId: string, papel: Acesso["papel"]): Acesso {
  return {
    usuarioId: "usuario-teste",
    nome: "Pessoa Teste",
    email: "pessoa@exemplo.test",
    empresaId,
    nomeEmpresa: "Empresa",
    cnpjEmpresa: "00000000000000",
    papel,
    superadministrador: false,
  };
}

describe("isolamento entre empresas", () => {
  let empresaA = "";
  let empresaB = "";

  beforeEach(async () => {
    empresaA = (
      await criarEmpresaDeTeste({ nomeFantasia: "Empresa A", cnpj: completarCnpj("510000000001") })
    ).id;
    empresaB = (
      await criarEmpresaDeTeste({ nomeFantasia: "Empresa B", cnpj: completarCnpj("510000000002") })
    ).id;
  });

  it("a empresa B não lê, edita nem apaga cliente e filial da empresa A", async () => {
    const documento = completarCnpj("520000000001");
    const criado = await criarCliente(empresaA, cliente(documento));
    const filialCriada = await criarFilial(empresaA, criado.id, filial(completarCnpj("530000000001")));

    expect(await listarClientes(empresaB)).toEqual([]);
    expect((await obterPainel(empresaB)).totalClientes).toBe(0);
    expect((await obterPainel(empresaA)).totalClientes).toBe(1);
    expect((await obterPainel(empresaA)).totalFiliais).toBe(1);

    await expect(obterCliente(empresaB, criado.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      atualizarCliente(empresaB, criado.id, cliente(documento, "Nome Invadido")),
    ).rejects.toMatchObject({ status: 404 });
    await expect(excluirCliente(empresaB, criado.id)).rejects.toMatchObject({ status: 404 });
    await expect(obterFilial(empresaB, filialCriada.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      atualizarFilial(empresaB, filialCriada.id, {
        ...filial(completarCnpj("530000000001")),
        nome: "NOME INVADIDO",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(excluirFilial(empresaB, filialCriada.id)).rejects.toMatchObject({ status: 404 });
    await expect(criarFilial(empresaB, criado.id, filial(completarCnpj("530000000002")))).rejects.toMatchObject({
      status: 404,
    });

    const intacto = await obterCliente(empresaA, criado.id);
    expect(intacto.nomeFantasia).toBe("Cliente Isolado Teste");
    expect(intacto.filiais).toHaveLength(1);
    expect(intacto.filiais[0].nome).toBe("FILIAL ISOLADA TESTE");
  });

  it("o mesmo CPF/CNPJ pode existir nas duas empresas, e o empresaId do navegador é ignorado", async () => {
    const documento = completarCnpj("520000000002");
    const naA = await criarCliente(empresaA, { ...cliente(documento), empresaId: empresaB });
    const naB = await criarCliente(empresaB, cliente(documento, "Mesmo Documento B"));

    expect(naA.id).not.toBe(naB.id);
    const gravado = await prisma.cliente.findUniqueOrThrow({ where: { id: naA.id } });
    expect(gravado.empresaId).toBe(empresaA);
    expect(await listarClientes(empresaA, { q: documento })).toHaveLength(1);
    expect(await listarClientes(empresaB, { q: documento })).toHaveLength(1);
  });

  it("serviço e valor combinado de uma empresa não aparecem na outra", async () => {
    const servicoA = await criarServico(acessoDe(empresaA, "DONO"), {
      nome: "Licença isolada",
      precoPadrao: "189,90",
      ativo: true,
    });
    const clienteA = await criarCliente(empresaA, cliente(completarCnpj("560000000010")));
    const vinculoA = await criarServicoDoCliente(acessoDe(empresaA, "FINANCEIRO"), clienteA.id, {
      servicoId: servicoA.id,
      valor: "100,00",
      recorrencia: "MENSAL",
      inicioEm: "2026-04-01",
      status: "ATIVO",
    });
    const clienteB = await criarCliente(empresaB, cliente(completarCnpj("560000000011"), "Cliente B"));
    const servicoB = await criarServico(acessoDe(empresaB, "DONO"), {
      nome: "Licença isolada",
      precoPadrao: "50,00",
      ativo: true,
    });

    expect(await listarServicos(empresaB)).toEqual([
      expect.objectContaining({ id: servicoB.id, precoPadrao: "50.00" }),
    ]);
    expect(await listarServicosDoCliente(empresaB, clienteB.id)).toEqual([]);
    expect((await obterPainel(empresaB)).receitaMensal).toBe("0.00");
    expect((await obterPainel(empresaA)).receitaMensal).toBe("100.00");

    await expect(obterServico(empresaB, servicoA.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      atualizarServico(acessoDe(empresaB, "DONO"), servicoA.id, {
        nome: "Nome invadido",
        precoPadrao: "1,00",
        ativo: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(excluirServico(acessoDe(empresaB, "DONO"), servicoA.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(listarServicosDoCliente(empresaB, clienteA.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      criarServicoDoCliente(acessoDe(empresaB, "DONO"), clienteA.id, {
        servicoId: servicoB.id,
        valor: "1,00",
        recorrencia: "AVULSO",
        inicioEm: "2026-04-01",
        status: "ATIVO",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      criarServicoDoCliente(acessoDe(empresaB, "DONO"), clienteB.id, {
        servicoId: servicoA.id,
        valor: "1,00",
        recorrencia: "MENSAL",
        inicioEm: "2026-04-01",
        status: "ATIVO",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      atualizarServicoDoCliente(acessoDe(empresaB, "DONO"), vinculoA.id, {
        servicoId: servicoB.id,
        valor: "1,00",
        recorrencia: "MENSAL",
        inicioEm: "2026-04-01",
        status: "ATIVO",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(excluirServicoDoCliente(acessoDe(empresaB, "DONO"), vinculoA.id)).rejects.toMatchObject({
      status: 404,
    });

    const intacto = await obterServico(empresaA, servicoA.id);
    expect(intacto.nome).toBe("Licença isolada");
    expect(intacto.precoPadrao).toBe("189.90");
    expect((await listarServicosDoCliente(empresaA, clienteA.id))[0].valor).toBe("100.00");

    await expect(
      prisma.clienteServico.create({
        data: {
          empresaId: empresaB,
          clienteId: clienteA.id,
          servicoId: servicoB.id,
          valor: "1.00",
          recorrencia: "MENSAL",
          inicioEm: new Date("2026-04-01T00:00:00.000Z"),
          status: "ATIVO",
        },
      }),
    ).rejects.toThrow(/cliente_outra_empresa/);
    await expect(
      prisma.clienteServico.create({
        data: {
          empresaId: empresaA,
          clienteId: clienteA.id,
          servicoId: servicoB.id,
          valor: "1.00",
          recorrencia: "MENSAL",
          inicioEm: new Date("2026-04-01T00:00:00.000Z"),
          status: "ATIVO",
        },
      }),
    ).rejects.toThrow(/servico_outra_empresa/);
  });
});

describe("cadastro da empresa e papéis", () => {
  function cadastro(cnpj: string, email: string) {
    return {
      razaoSocial: "Nova Empresa Teste Ltda",
      nomeFantasia: "Nova Empresa Teste",
      cnpj,
      emailContato: "contato@nova.exemplo.test",
      telefone: "11988887777",
      nome: "Dono Teste",
      email,
      senha: "senha-teste-123",
    };
  }

  it("o autocadastro cria o dono sem superadministrador e recusa a quarta tentativa do mesmo e-mail", async () => {
    const email = "dono.limite@exemplo.test";
    const empresa = await cadastrarEmpresaPublica(cadastro(completarCnpj("540000000001"), email), "203.0.113.10");
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email } });
    expect(usuario.papel).toBe("DONO");
    expect(usuario.superadministrador).toBe(false);
    expect(usuario.empresaId).toBeTruthy();
    expect(empresa.plano).toBe("basico");

    await expect(
      cadastrarEmpresaPublica(cadastro(completarCnpj("540000000002"), email), "203.0.113.11"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      cadastrarEmpresaPublica(cadastro(completarCnpj("540000000003"), email), "203.0.113.12"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      cadastrarEmpresaPublica(cadastro(completarCnpj("540000000004"), email), "203.0.113.13"),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("empresa suspensa não entra, suporte não cadastra usuário e o superadmin não suspende a própria empresa", async () => {
    const empresa = await criarEmpresaDeTeste({
      nomeFantasia: "Suspensa Teste",
      cnpj: completarCnpj("550000000001"),
      status: "SUSPENSA",
    });
    await prisma.usuario.create({
      data: {
        nome: "Dono Suspenso",
        email: "suspenso@exemplo.test",
        senhaHash: await gerarHashSenha("senha-teste-123"),
        empresaId: empresa.id,
        papel: "DONO",
      },
    });

    await expect(autenticar("suspenso@exemplo.test", "senha-teste-123")).rejects.toMatchObject({
      status: 403,
      codigo: "empresa_suspensa",
    });
    await expect(autenticar("suspenso@exemplo.test", "senha-errada")).rejects.toMatchObject({
      status: 401,
    });

    const ativa = await criarEmpresaDeTeste({
      nomeFantasia: "Ativa Teste",
      cnpj: completarCnpj("550000000002"),
    });
    await expect(
      criarUsuarioDaEmpresa(acessoDe(ativa.id, "SUPORTE"), {
        nome: "Nova Pessoa",
        email: "nova.pessoa@exemplo.test",
        senha: "senha-teste-123",
        papel: "FINANCEIRO",
      }),
    ).rejects.toMatchObject({ status: 403 });

    const criado = await criarUsuarioDaEmpresa(acessoDe(ativa.id, "DONO"), {
      nome: "Financeiro Teste",
      email: "financeiro.teste@exemplo.test",
      senha: "senha-teste-123",
      papel: "FINANCEIRO",
    });
    expect(criado.papel).toBe("FINANCEIRO");
    expect(criado.superadministrador).toBe(false);
    const noBanco = await prisma.usuario.findUniqueOrThrow({ where: { email: criado.email } });
    expect(noBanco.empresaId).toBe(ativa.id);

    const superadmin = { ...acessoDe(ativa.id, "DONO"), superadministrador: true };
    await expect(alterarStatusEmpresa(superadmin, ativa.id, "SUSPENSA")).rejects.toMatchObject({
      codigo: "suspensao_propria",
    });
    const outra = await alterarStatusEmpresa(superadmin, empresa.id, "ATIVA");
    expect(outra.status).toBe("ATIVA");
  });
});
