"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { SegmentoDTO } from "@/lib/tipos";
import { BotaoExcluir } from "./botao-excluir";
import { ChipSegmento } from "./chip-segmento";
import { EstadoVazio } from "./estado-vazio";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { FormularioSegmento } from "./formulario-segmento";
import { avisarErro, avisarSucesso } from "./notificador";
import { Selo } from "./selo";

function textoClientes(quantidade: number) {
  if (quantidade === 0) return "Nenhum cliente";
  if (quantidade === 1) return "1 cliente";
  return `${quantidade} clientes`;
}

export function PainelSegmentos({
  segmentos,
  podeEditar,
}: {
  segmentos: SegmentoDTO[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [modo, setModo] = useState<"lista" | "novo" | string>("lista");
  const [sugerindo, setSugerindo] = useState(false);
  const emEdicao = segmentos.find((segmento) => segmento.id === modo);

  async function sugerir() {
    setSugerindo(true);
    const resposta = await enviarJson<{ criados: number }>("/api/segmentos/sugestoes", "POST");
    setSugerindo(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(
      resposta.dados.criados === 0
        ? "Estes segmentos já estão cadastrados."
        : "Sugestões adicionadas.",
    );
    router.refresh();
  }

  async function alternarAtivo(segmento: SegmentoDTO) {
    const resposta = await enviarJson(`/api/segmentos/${segmento.id}`, "PATCH", {
      nome: segmento.nome,
      descricao: segmento.descricao ?? "",
      cor: segmento.cor ?? "",
      ativo: !segmento.ativo,
    });
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso(segmento.ativo ? "Segmento desativado" : "Segmento ativado");
    router.refresh();
  }

  return (
    <section>
      {!podeEditar ? (
        <p className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Você pode consultar os segmentos. Quem altera é o dono ou o financeiro.
        </p>
      ) : null}

      {podeEditar && modo === "lista" ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={classeBotaoPrimario} onClick={() => setModo("novo")}>
            Novo segmento
          </button>
          <button type="button" className={classeBotaoSecundario} onClick={sugerir} disabled={sugerindo}>
            {sugerindo ? "Adicionando..." : "Sugestões"}
          </button>
        </div>
      ) : null}

      {modo === "novo" ? (
        <FormularioSegmento aoCancelar={() => setModo("lista")} aoSalvar={() => setModo("lista")} />
      ) : null}
      {emEdicao ? (
        <FormularioSegmento
          key={emEdicao.id}
          segmento={emEdicao}
          aoCancelar={() => setModo("lista")}
          aoSalvar={() => setModo("lista")}
        />
      ) : null}

      {modo === "lista" && segmentos.length > 0 ? (
        <p className="mb-3 text-sm text-muted">
          {segmentos.length === 1 ? "1 segmento nesta empresa." : `${segmentos.length} segmentos nesta empresa.`}
        </p>
      ) : null}

      {modo === "lista" && segmentos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum segmento cadastrado"
          descricao="Cadastre os tipos de cliente desta empresa, como restaurante, padaria ou lanchonete. As sugestões criam os mais comuns."
        />
      ) : null}

      {modo === "lista" && segmentos.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {segmentos.map((segmento) => (
              <li
                key={segmento.id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{segmento.nome}</p>
                    <ChipSegmento nome={segmento.nome} cor={segmento.cor} />
                  </div>
                  {segmento.descricao ? <p className="mt-1 text-sm text-muted">{segmento.descricao}</p> : null}
                  <p className="mt-1 text-sm text-muted">{textoClientes(segmento.quantidadeClientes)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Selo valor={segmento.ativo ? "ATIVO" : "INATIVO"} tipo="servico" />
                  {podeEditar ? (
                    <>
                      <button type="button" className={classeBotaoSecundario} onClick={() => setModo(segmento.id)}>
                        Editar
                      </button>
                      {segmento.quantidadeClientes > 0 ? (
                        <button type="button" className={classeBotaoSecundario} onClick={() => alternarAtivo(segmento)}>
                          {segmento.ativo ? "Desativar" : "Ativar"}
                        </button>
                      ) : (
                        <BotaoExcluir
                          url={`/api/segmentos/${segmento.id}`}
                          rotulo="Excluir"
                          mensagem={`Excluir ${segmento.nome}? Esta ação não pode ser desfeita.`}
                          sucesso="Segmento excluído"
                        />
                      )}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
