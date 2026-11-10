import {
  MENSAGEM_CNPJ_FALHA,
  MENSAGEM_CNPJ_INFORME,
  MENSAGEM_CNPJ_INVALIDO,
  MENSAGEM_CNPJ_NAO_ENCONTRADO,
  MENSAGEM_CNPJ_OCUPADA,
  decidirConsultaCnpj,
  mapearRespostaBrasilApi,
  type CamposCadastroCnpj,
} from "@/lib/consulta-cnpj";
import { ErroAplicacao } from "@/server/erros";

const ORIGEM = "https://brasilapi.com.br/api/cnpj/v1/";

export type LimiteConsulta = {
  permitir(chave: string, agora: number): boolean;
};

export type OpcoesConsultaCnpj = {
  buscar?: typeof fetch;
  agora?: number;
  limite?: LimiteConsulta;
};

export function criarLimiteConsulta(maximo: number, janelaMs: number): LimiteConsulta {
  const usos = new Map<string, number[]>();
  return {
    permitir(chave, agora) {
      const recentes = (usos.get(chave) ?? []).filter((quando) => agora - quando < janelaMs);
      if (recentes.length >= maximo) {
        usos.set(chave, recentes);
        return false;
      }
      recentes.push(agora);
      usos.set(chave, recentes);
      return true;
    },
  };
}

const limitePadrao = criarLimiteConsulta(30, 60_000);

export async function consultarCnpj(
  cnpj: string,
  empresaId: string,
  opcoes: OpcoesConsultaCnpj = {},
): Promise<{ cnpj: string; campos: CamposCadastroCnpj }> {
  const decisao = decidirConsultaCnpj(cnpj.slice(0, 32));
  if (decisao.acao !== "consultar") {
    throw new ErroAplicacao(
      decisao.acao === "recusar" ? decisao.mensagem : MENSAGEM_CNPJ_INFORME,
      422,
      "cnpj_invalido",
    );
  }

  const limite = opcoes.limite ?? limitePadrao;
  if (!limite.permitir(empresaId, opcoes.agora ?? Date.now())) {
    throw new ErroAplicacao(MENSAGEM_CNPJ_OCUPADA, 429, "cnpj_limite");
  }

  const buscar = opcoes.buscar ?? fetch;
  let resposta: Response;
  try {
    resposta = await buscar(`${ORIGEM}${encodeURIComponent(decisao.cnpj)}`, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Taguaro/GestaoCobranca",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new ErroAplicacao(MENSAGEM_CNPJ_FALHA, 502, "cnpj_indisponivel");
  }

  if (resposta.status === 404) {
    throw new ErroAplicacao(MENSAGEM_CNPJ_NAO_ENCONTRADO, 404, "cnpj_nao_encontrado");
  }
  if (resposta.status === 400) {
    throw new ErroAplicacao(MENSAGEM_CNPJ_INVALIDO, 422, "cnpj_invalido");
  }
  if (resposta.status === 429) {
    throw new ErroAplicacao(MENSAGEM_CNPJ_OCUPADA, 429, "cnpj_limite");
  }
  if (!resposta.ok) {
    throw new ErroAplicacao(MENSAGEM_CNPJ_FALHA, 502, "cnpj_indisponivel");
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw new ErroAplicacao(MENSAGEM_CNPJ_FALHA, 502, "cnpj_indisponivel");
  }

  const mapeado = mapearRespostaBrasilApi(corpo);
  if (!mapeado.ok) {
    throw new ErroAplicacao(mapeado.mensagem, mapeado.status, mapeado.codigo);
  }
  return { cnpj: decisao.cnpj, campos: mapeado.campos };
}
