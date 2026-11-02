"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { CORES_SEGMENTO } from "@/lib/segmentos";
import type { SegmentoDTO } from "@/lib/tipos";
import { esquemaSegmento, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

type Valores = {
  nome: string;
  descricao: string;
  cor: string;
  ativo: string;
};

const vazio: Valores = { nome: "", descricao: "", cor: "#0b3861", ativo: "true" };

export function FormularioSegmento({
  segmento,
  aoCancelar,
  aoSalvar,
}: {
  segmento?: SegmentoDTO;
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>(
    segmento
      ? {
          nome: segmento.nome,
          descricao: segmento.descricao ?? "",
          cor: segmento.cor ?? "",
          ativo: String(segmento.ativo),
        }
      : vazio,
  );
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function alterar(nome: keyof Valores, valor: string) {
    setValores((atual) => ({ ...atual, [nome]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaSegmento.safeParse(valores);
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }

    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson<{ segmento: SegmentoDTO }>(
      segmento ? `/api/segmentos/${segmento.id}` : "/api/segmentos",
      segmento ? "PATCH" : "POST",
      resultado.data,
    );
    setEnviando(false);

    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }

    if (!segmento) setValores(vazio);
    avisarSucesso(segmento ? "Segmento salvo" : "Segmento cadastrado");
    if (segmento) aoSalvar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="mb-6 rounded-3xl border border-line bg-card p-5 md:p-6">
      <h2 className="font-display text-2xl">{segmento ? "Editar segmento" : "Novo segmento"}</h2>
      <p className="mt-1 text-sm text-muted">
        O nome identifica o tipo de cliente desta empresa. A cor aparece no chip da lista.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Campo label="Nome" htmlFor="segmento-nome" erro={campos.nome} obrigatorio>
          <input
            id="segmento-nome"
            className={classeCampo}
            value={valores.nome}
            placeholder="Exemplo: Padaria"
            onChange={(evento) => alterar("nome", evento.target.value)}
          />
        </Campo>
        <Campo label="Situação" htmlFor="segmento-ativo" erro={campos.ativo}>
          <select
            id="segmento-ativo"
            className={classeCampo}
            value={valores.ativo}
            onChange={(evento) => alterar("ativo", evento.target.value)}
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </Campo>
        <div className="md:col-span-2">
          <Campo label="Descrição" htmlFor="segmento-descricao" erro={campos.descricao} dica="Opcional.">
            <textarea
              id="segmento-descricao"
              className={`${classeCampo} min-h-20 resize-y`}
              value={valores.descricao}
              onChange={(evento) => alterar("descricao", evento.target.value)}
            />
          </Campo>
        </div>
        <div className="md:col-span-2">
          <Campo label="Cor" htmlFor="segmento-cor" erro={campos.cor} dica="Opcional. Use uma cor da paleta ou informe #RRGGBB.">
            <div className="flex flex-wrap items-center gap-2">
              {CORES_SEGMENTO.map((cor) => {
                const escolhida = valores.cor.toLowerCase() === cor.valor;
                return (
                  <button
                    key={cor.valor}
                    type="button"
                    aria-label={cor.nome}
                    aria-pressed={escolhida}
                    title={cor.nome}
                    className={`size-9 cursor-pointer rounded-full border-2 ${escolhida ? "border-gold" : "border-transparent"}`}
                    style={{ backgroundColor: cor.valor }}
                    onClick={() => alterar("cor", cor.valor)}
                  />
                );
              })}
              <input
                id="segmento-cor"
                className={`${classeCampo} max-w-36`}
                value={valores.cor}
                placeholder="#0b3861"
                onChange={(evento) => alterar("cor", evento.target.value)}
              />
              {valores.cor ? (
                <button type="button" className={classeBotaoSecundario} onClick={() => alterar("cor", "")}>
                  Sem cor
                </button>
              ) : null}
            </div>
          </Campo>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Salvando..." : segmento ? "Salvar segmento" : "Cadastrar segmento"}
        </button>
        <button type="button" className={classeBotaoSecundario} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
