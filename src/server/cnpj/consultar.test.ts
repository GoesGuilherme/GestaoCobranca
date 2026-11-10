import { describe, expect, it } from "vitest";
import { completarCnpj } from "@/lib/documento";
import {
  MENSAGEM_CNPJ_FALHA,
  MENSAGEM_CNPJ_INAPTA,
  MENSAGEM_CNPJ_INFORME,
  MENSAGEM_CNPJ_INVALIDO,
  MENSAGEM_CNPJ_NAO_ENCONTRADO,
  MENSAGEM_CNPJ_OCUPADA,
} from "@/lib/consulta-cnpj";
import { ErroAplicacao } from "@/server/erros";
import { consultarCnpj, criarLimiteConsulta } from "./consultar";

const CNPJ = "19131243000197";

const receita = {
  uf: "SP",
  cep: "01311902",
  bairro: "BELA VISTA",
  numero: "37",
  municipio: "SAO PAULO",
  logradouro: "PAULISTA 37",
  complemento: "ANDAR 4",
  razao_social: "OPEN KNOWLEDGE BRASIL",
  nome_fantasia: "REDE PELO CONHECIMENTO LIVRE",
  situacao_cadastral: 2,
  descricao_situacao_cadastral: "ATIVA",
  descricao_tipo_de_logradouro: "AVENIDA",
};

function opcoes(buscar: typeof fetch, maximo = 5) {
  return { buscar, limite: criarLimiteConsulta(maximo, 60_000), agora: 1_000 };
}

describe("consulta de CNPJ na BrasilAPI", () => {
  it("busca o CNPJ sem máscara e devolve os campos cadastrais", async () => {
    const urls: string[] = [];
    const resultado = await consultarCnpj("19.131.243/0001-97", "emp-1", opcoes(async (url) => {
      urls.push(String(url));
      return Response.json(receita);
    }));

    expect(urls).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${CNPJ}`]);
    expect(resultado.cnpj).toBe(CNPJ);
    expect(resultado.campos.razaoSocial).toBe("Open Knowledge Brasil");
    expect(resultado.campos.endereco).toBe("Avenida Paulista");
    expect(resultado.campos.cep).toBe("01311-902");
  });

  it("envia CNPJ alfanumérico válido para a mesma origem", async () => {
    const cnpj = completarCnpj("ab12cd34ef01");
    let url = "";
    await consultarCnpj(cnpj, "emp-1", opcoes(async (entrada) => {
      url = String(entrada);
      return Response.json({ ...receita, razao_social: "ALFA LTDA" });
    }));
    expect(url).toBe(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  });

  it("não chama a origem quando o CNPJ é inválido ou incompleto", async () => {
    let chamadas = 0;
    const buscar = async () => {
      chamadas += 1;
      return Response.json(receita);
    };
    await expect(consultarCnpj("19.131.243/0001-00", "emp-1", opcoes(buscar))).rejects.toMatchObject({
      message: MENSAGEM_CNPJ_INVALIDO,
      status: 422,
      codigo: "cnpj_invalido",
    });
    await expect(consultarCnpj("19131243", "emp-1", opcoes(buscar))).rejects.toMatchObject({
      message: MENSAGEM_CNPJ_INFORME,
      status: 422,
    });
    expect(chamadas).toBe(0);
  });

  it("avisa CNPJ não encontrado, inapto e falha sem repetir o corpo da origem", async () => {
    const naoEncontrado = consultarCnpj(CNPJ, "emp-1", opcoes(async () => Response.json(
      { message: "stack em /var/app e postgres://segredo", type: "not_found" },
      { status: 404 },
    )));
    await expect(naoEncontrado).rejects.toBeInstanceOf(ErroAplicacao);
    await expect(naoEncontrado).rejects.toMatchObject({
      message: MENSAGEM_CNPJ_NAO_ENCONTRADO,
      status: 404,
      codigo: "cnpj_nao_encontrado",
    });
    await expect(naoEncontrado).rejects.not.toMatchObject({
      message: expect.stringMatching(/postgres|\/var\/app|stack/),
    });

    await expect(
      consultarCnpj(CNPJ, "emp-2", opcoes(async () => Response.json(
        { ...receita, descricao_situacao_cadastral: "INAPTA", situacao_cadastral: 4 },
      ))),
    ).rejects.toMatchObject({ message: MENSAGEM_CNPJ_INAPTA, status: 422, codigo: "cnpj_inapta" });

    await expect(
      consultarCnpj(CNPJ, "emp-3", opcoes(async () => Response.json(
        { message: "timeout at 10.1.1.1" },
        { status: 503 },
      ))),
    ).rejects.toMatchObject({ message: MENSAGEM_CNPJ_FALHA, status: 502, codigo: "cnpj_indisponivel" });

    await expect(
      consultarCnpj(CNPJ, "emp-4", opcoes(async () => {
        throw new Error("getaddrinfo EAI_AGAIN brasilapi.com.br");
      })),
    ).rejects.toMatchObject({ message: MENSAGEM_CNPJ_FALHA, status: 502 });
  });

  it("limita consultas seguidas da mesma empresa", async () => {
    let chamadas = 0;
    const buscar = async () => {
      chamadas += 1;
      return Response.json(receita);
    };
    const limite = opcoes(buscar, 2);
    await consultarCnpj(CNPJ, "emp-limite", limite);
    await consultarCnpj(CNPJ, "emp-limite", limite);
    await expect(consultarCnpj(CNPJ, "emp-limite", limite)).rejects.toMatchObject({
      message: MENSAGEM_CNPJ_OCUPADA,
      status: 429,
      codigo: "cnpj_limite",
    });
    expect(chamadas).toBe(2);
  });

  it("trata corpo que não é JSON como falha genérica", async () => {
    await expect(
      consultarCnpj(CNPJ, "emp-5", opcoes(async () => new Response("<html>erro interno</html>", { status: 200 }))),
    ).rejects.toMatchObject({ message: MENSAGEM_CNPJ_FALHA, status: 502 });
  });
});
