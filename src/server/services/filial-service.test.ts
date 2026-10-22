import { beforeEach, describe, expect, it } from "vitest";
import { completarCnpj, formatarCnpj } from "@/lib/documento";
import { ErroAplicacao } from "@/server/erros";
import { criarCliente } from "./cliente-service";
import {
  atualizarFilial,
  criarFilial,
  excluirFilial,
  listarFiliais,
  obterFilial,
} from "./filial-service";
import { criarEmpresaDeTeste, usarBancoDeTeste } from "./teste-db";

usarBancoDeTeste();

let empresaId = "";

beforeEach(async () => {
  const empresa = await criarEmpresaDeTeste({
    nomeFantasia: "Empresa Filial Teste",
    cnpj: completarCnpj("500000000002"),
  });
  empresaId = empresa.id;
});

async function cliente() {
  return criarCliente(empresaId, {
    nomeFantasia: "Grupo Exemplo Teste",
    razaoSocial: "Grupo Exemplo Teste Ltda",
    documento: completarCnpj("400000000001"),
    segmento: "RESTAURANTE",
    contatoNome: "Helena Exemplo",
    whatsapp: "11988887777",
    email: "helena@exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
  });
}

function filial(cnpj: string, extra: Record<string, string> = {}) {
  return {
    nome: "PRAIA GRANDE FOODTRUCK",
    cnpj,
    endereco: "Av. Exemplo, 100 - Boqueirão",
    cidade: "Praia Grande",
    uf: "sp",
    status: "ATIVA",
    observacoes: "Filial de teste.",
    ...extra,
  };
}

describe("serviço de filiais", () => {
  it("vincula a filial ao cliente e formata o CNPJ", async () => {
    const grupo = await cliente();
    const cnpj = completarCnpj("410000000001");
    const criada = await criarFilial(empresaId, grupo.id, filial(cnpj));

    expect(criada.clienteId).toBe(grupo.id);
    expect(criada.cnpj).toBe(formatarCnpj(cnpj));
    expect(criada.uf).toBe("SP");

    const lista = await listarFiliais(empresaId, grupo.id);
    expect(lista.map((item) => item.nome)).toEqual(["PRAIA GRANDE FOODTRUCK"]);
  });

  it("rejeita CNPJ inválido e cliente inexistente", async () => {
    const grupo = await cliente();
    await expect(criarFilial(empresaId, grupo.id, filial("11.111.111/1111-11"))).rejects.toBeInstanceOf(
      ErroAplicacao,
    );
    await expect(criarFilial(empresaId, "cliente-inexistente", filial(completarCnpj("410000000002")))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("atualiza e exclui a filial", async () => {
    const grupo = await cliente();
    const criada = await criarFilial(empresaId, grupo.id, filial(completarCnpj("410000000003")));
    const atualizada = await atualizarFilial(empresaId, criada.id, {
      ...filial(completarCnpj("410000000003")),
      nome: "SANTOS CENTRO EXEMPLO",
      status: "EM_IMPLANTACAO",
    });

    expect(atualizada.nome).toBe("SANTOS CENTRO EXEMPLO");
    expect(atualizada.status).toBe("EM_IMPLANTACAO");
    expect((await obterFilial(empresaId, criada.id)).nome).toBe("SANTOS CENTRO EXEMPLO");

    await excluirFilial(empresaId, criada.id);
    await expect(obterFilial(empresaId, criada.id)).rejects.toMatchObject({ status: 404 });
    expect(await listarFiliais(empresaId, grupo.id)).toEqual([]);
  });
});
