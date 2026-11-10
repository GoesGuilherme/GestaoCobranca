"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONSULTA_OCIOSA,
  MEMORIA_CONSULTA,
  MENSAGEM_CNPJ_FALHA,
  MENSAGEM_CNPJ_SEM_DADOS,
  MENSAGEM_CNPJ_SUCESSO,
  lerCamposCadastro,
  mensagemVisivelConsulta,
  passoConsulta,
  type CamposCadastroCnpj,
  type EstadoConsultaCnpj,
  type MemoriaConsulta,
} from "@/lib/consulta-cnpj";

export function useConsultaCnpj(
  documento: string,
  aoPreencher: (campos: CamposCadastroCnpj) => void,
  aoNaoAutenticado?: () => void,
) {
  const [estado, setEstado] = useState<EstadoConsultaCnpj>(CONSULTA_OCIOSA);
  const preencher = useRef(aoPreencher);
  const naoAutenticado = useRef(aoNaoAutenticado);
  const memoria = useRef<MemoriaConsulta>({ ...MEMORIA_CONSULTA });
  preencher.current = aoPreencher;
  naoAutenticado.current = aoNaoAutenticado;

  useEffect(() => {
    const resultado = passoConsulta(memoria.current, documento);
    memoria.current = resultado.memoria;
    if (resultado.passo.tipo === "ocioso") {
      setEstado(CONSULTA_OCIOSA);
      return;
    }
    if (resultado.passo.tipo === "erro") {
      setEstado({ fase: "erro", texto: resultado.passo.mensagem });
      return;
    }
    if (resultado.passo.tipo === "repetir") {
      setEstado({ fase: "sucesso", texto: MENSAGEM_CNPJ_SUCESSO });
      return;
    }

    const cnpj = resultado.passo.cnpj;
    let vivo = true;
    const controle = new AbortController();
    setEstado({ fase: "carregando" });
    void buscarCadastroCnpj(cnpj, controle.signal)
      .then((resposta) => {
        if (!vivo) return;
        if (resposta.ok) {
          memoria.current = { ...memoria.current, consultado: cnpj };
          preencher.current(resposta.campos);
          setEstado({ fase: "sucesso", texto: resposta.mensagem });
          return;
        }
        if (resposta.status === 401) naoAutenticado.current?.();
        setEstado({ fase: "erro", texto: resposta.mensagem });
      })
      .catch((erro: unknown) => {
        if (!vivo || pedidoAbortado(erro)) return;
        setEstado({ fase: "erro", texto: MENSAGEM_CNPJ_FALHA });
      });

    return () => {
      vivo = false;
      controle.abort();
    };
  }, [documento]);

  return { estado };
}

export async function buscarCadastroCnpj(
  cnpj: string,
  sinal?: AbortSignal,
): Promise<{ ok: true; campos: CamposCadastroCnpj; mensagem: string } | { ok: false; mensagem: string; status: number }> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/cnpj?cnpj=${encodeURIComponent(cnpj)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: sinal,
    });
  } catch (erro) {
    if (pedidoAbortado(erro)) throw erro;
    return { ok: false, mensagem: MENSAGEM_CNPJ_FALHA, status: 0 };
  }

  const dados = (await resposta.json().catch(() => null)) as { erro?: unknown; campos?: unknown } | null;
  if (!resposta.ok) {
    return { ok: false, mensagem: mensagemVisivelConsulta(dados?.erro), status: resposta.status };
  }

  const campos = lerCamposCadastro(dados?.campos);
  if (!campos) return { ok: false, mensagem: MENSAGEM_CNPJ_SEM_DADOS, status: 502 };
  return { ok: true, campos, mensagem: MENSAGEM_CNPJ_SUCESSO };
}

function pedidoAbortado(erro: unknown): boolean {
  return erro instanceof Error && erro.name === "AbortError";
}
