import { describe, expect, it } from "vitest";
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
import { usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

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
    const cliente = await criarCliente(exemplo(documento));

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
    const cliente = await criarCliente(
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
    await expect(criarCliente(exemplo("00.000.000/0000-00"))).rejects.toBeInstanceOf(ErroAplicacao);
    await criarCliente(exemplo(documento));
    await expect(criarCliente(exemplo(documento))).rejects.toMatchObject({ status: 409 });
  });

  it("busca por nome, cidade e CNPJ e filtra segmento e status", async () => {
    await criarCliente(exemplo(completarCnpj("300000000003"), { cidade: "Santos" }));
    await criarCliente(
      exemplo(completarCnpj("300000000004"), {
        nomeFantasia: "Mercado Exemplo Teste",
        cidade: "Campinas",
        segmento: "MERCADO_AUTONOMO",
        status: "INATIVO",
      }),
    );

    const porCidade = await listarClientes({ q: "camp" });
    expect(porCidade).toHaveLength(1);
    expect(porCidade[0].cidade).toBe("Campinas");

    const porDocumento = await listarClientes({ q: "30.000.000/0003" });
    expect(porDocumento).toHaveLength(1);

    const porStatus = await listarClientes({
      segmento: "MERCADO_AUTONOMO",
      status: "INATIVO",
    });
    expect(porStatus.map((item) => item.nomeFantasia)).toEqual(["Mercado Exemplo Teste"]);

    const ignorado = await listarClientes({ segmento: "nao-existe" });
    expect(ignorado.length).toBe(2);
  });

  it("atualiza o cliente e impede trocar para um documento já usado", async () => {
    const primeiro = await criarCliente(exemplo(completarCnpj("300000000005")));
    const segundo = await criarCliente(
      exemplo(completarCnpj("300000000006"), { nomeFantasia: "Outro Exemplo" }),
    );

    const atualizado = await atualizarCliente(primeiro.id, {
      ...exemplo(completarCnpj("300000000005")),
      nomeFantasia: "Nome Novo Exemplo",
      status: "EM_IMPLANTACAO",
      observacoes: "",
    });
    expect(atualizado.nomeFantasia).toBe("Nome Novo Exemplo");
    expect(atualizado.status).toBe("EM_IMPLANTACAO");
    expect(atualizado.observacoes).toBeNull();

    await expect(
      atualizarCliente(segundo.id, exemplo(completarCnpj("300000000005"))),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("exclui o cliente e as filiais vinculadas", async () => {
    const cliente = await criarCliente(exemplo(completarCnpj("300000000007")));
    await criarFilial(cliente.id, {
      nome: "PRAIA GRANDE FOODTRUCK",
      cnpj: completarCnpj("310000000001"),
      endereco: "Av. Exemplo, 100",
      cidade: "Praia Grande",
      uf: "SP",
      status: "ATIVA",
    });

    await excluirCliente(cliente.id);
    await expect(obterCliente(cliente.id)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.filial.count()).toBe(0);
  });
});
