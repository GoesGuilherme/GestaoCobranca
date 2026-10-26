import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj, completarCpf, formatarCnpj, formatarCpf } from "@/lib/documento";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import {
  atualizarCliente,
  criarCliente,
  excluirCliente,
  listarClientes,
  obterCliente,
} from "./cliente-service";
import { criarFilial } from "./filial-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";

beforeEach(async () => {
  const empresa = await criarEmpresaDeTeste({
    nomeFantasia: "Empresa Teste",
    cnpj: completarCnpj("500000000001"),
  });
  empresaId = empresa.id;
});

function exemplo(documento: string, extra: Record<string, string> = {}) {
  return {
    nomeFantasia: "Restaurante Exemplo Teste",
    razaoSocial: "Restaurante Exemplo Teste Ltda",
    documento,
    segmento: "RESTAURANTE",
    contatoNome: "Ana Exemplo",
    whatsapp: "(13) 98888-1001",
    email: "Ana@Exemplo.Test",
    cidade: "Praia Grande",
    uf: "sp",
    status: "ATIVO",
    observacoes: "Cadastro de teste.",
    ...extra,
  };
}

describe("serviço de clientes", () => {
  it("cadastra, formata documento e normaliza e-mail, WhatsApp e UF", async () => {
    const documento = completarCnpj("300000000001");
    const cliente = await criarCliente(empresaId, exemplo(documento));

    expect(cliente.documento).toBe(formatarCnpj(documento));
    expect(cliente.tipoDocumento).toBe("CNPJ");
    expect(cliente.email).toBe("ana@exemplo.test");
    expect(cliente.whatsapp).toBe("(13) 98888-1001");
    expect(cliente.uf).toBe("SP");
    expect(cliente.quantidadeFiliais).toBe(0);
    expect(cliente.criadoEm).toBeTruthy();
    expect(cliente.atualizadoEm).toBeTruthy();
  });

  it("aceita CPF de pessoa física", async () => {
    const cliente = await criarCliente(empresaId, 
      exemplo(completarCpf("000000001"), {
        nomeFantasia: "Maria Exemplo Teste",
        segmento: "OUTRO",
      }),
    );
    expect(cliente.tipoDocumento).toBe("CPF");
    expect(cliente.documento).toBe(formatarCpf(completarCpf("000000001")));
  });

  it("rejeita documento inválido e documento repetido", async () => {
    const documento = completarCnpj("300000000002");
    await expect(criarCliente(empresaId, exemplo("00.000.000/0000-00"))).rejects.toBeInstanceOf(ErroAplicacao);
    await criarCliente(empresaId, exemplo(documento));
    await expect(criarCliente(empresaId, exemplo(documento))).rejects.toMatchObject({ status: 409 });
  });

  it("busca por nome, cidade e CNPJ e filtra segmento e status", async () => {
    await criarCliente(empresaId, exemplo(completarCnpj("300000000003"), { cidade: "Santos" }));
    await criarCliente(empresaId, 
      exemplo(completarCnpj("300000000004"), {
        nomeFantasia: "Mercado Exemplo Teste",
        cidade: "Campinas",
        segmento: "MERCADO_AUTONOMO",
        status: "INATIVO",
      }),
    );

    const porCidade = await listarClientes(empresaId, { q: "camp" });
    expect(porCidade).toHaveLength(1);
    expect(porCidade[0].cidade).toBe("Campinas");

    const porDocumento = await listarClientes(empresaId, { q: "30.000.000/0003" });
    expect(porDocumento).toHaveLength(1);

    const porStatus = await listarClientes(empresaId, {
      segmento: "MERCADO_AUTONOMO",
      status: "INATIVO",
    });
    expect(porStatus.map((item) => item.nomeFantasia)).toEqual(["Mercado Exemplo Teste"]);

    const ignorado = await listarClientes(empresaId, { segmento: "nao-existe" });
    expect(ignorado.length).toBe(2);
  });

  it("atualiza o cliente e impede trocar para um documento já usado", async () => {
    const primeiro = await criarCliente(empresaId, exemplo(completarCnpj("300000000005")));
    const segundo = await criarCliente(empresaId, 
      exemplo(completarCnpj("300000000006"), { nomeFantasia: "Outro Exemplo" }),
    );

    const atualizado = await atualizarCliente(empresaId, primeiro.id, {
      ...exemplo(completarCnpj("300000000005")),
      nomeFantasia: "Nome Novo Exemplo",
      status: "EM_IMPLANTACAO",
      observacoes: "",
    });
    expect(atualizado.nomeFantasia).toBe("Nome Novo Exemplo");
    expect(atualizado.status).toBe("EM_IMPLANTACAO");
    expect(atualizado.observacoes).toBeNull();

    await expect(
      atualizarCliente(empresaId, segundo.id, exemplo(completarCnpj("300000000005"))),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("exclui o cliente e as filiais vinculadas", async () => {
    const cliente = await criarCliente(empresaId, exemplo(completarCnpj("300000000007")));
    await criarFilial(empresaId, cliente.id, {
      nome: "PRAIA GRANDE FOODTRUCK",
      cnpj: completarCnpj("310000000001"),
      endereco: "Av. Exemplo, 100",
      cidade: "Praia Grande",
      uf: "SP",
      status: "ATIVA",
    });

    await excluirCliente(empresaId, cliente.id);
    await expect(obterCliente(empresaId, cliente.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.filial.count()).toBe(0);
  });

  it("só o dono marca ou tira o status bloqueado", async () => {
    const pessoa = await criarCliente(empresaId, exemplo(completarCnpj("300000000008")), "DONO");
    await expect(
      atualizarCliente(empresaId, pessoa.id, exemplo(completarCnpj("300000000008"), { status: "BLOQUEADO" }), "FINANCEIRO"),
    ).rejects.toMatchObject({ status: 403 });
    const bloqueado = await atualizarCliente(
      empresaId,
      pessoa.id,
      exemplo(completarCnpj("300000000008"), { status: "BLOQUEADO" }),
      "DONO",
    );
    expect(bloqueado.status).toBe("BLOQUEADO");
    await expect(
      atualizarCliente(empresaId, pessoa.id, exemplo(completarCnpj("300000000008"), { status: "ATIVO" }), "FINANCEIRO"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(criarCliente(empresaId, exemplo(completarCnpj("300000000009"), { status: "BLOQUEADO" }), "FINANCEIRO")).rejects.toMatchObject({
      status: 403,
    });
  });
});
