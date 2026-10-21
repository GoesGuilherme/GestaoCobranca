"use client";

import { useState } from "react";
import type { FilialDTO } from "@/lib/tipos";
import { BotaoExcluir } from "./botao-excluir";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { FormularioFilial } from "./formulario-filial";
import { Selo } from "./selo";

export function PainelFiliais({
  clienteId,
  filiais,
  cidade,
  uf,
}: {
  clienteId: string;
  filiais: FilialDTO[];
  cidade: string;
  uf: string;
}) {
  const [modo, setModo] = useState<"lista" | "nova" | string>("lista");
  const emEdicao = filiais.find((filial) => filial.id === modo);

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Filiais</h2>
          <p className="mt-1 text-sm text-muted">
            {filiais.length === 0
              ? "Nenhuma filial cadastrada."
              : filiais.length === 1
                ? "1 filial neste grupo."
                : `${filiais.length} filiais neste grupo.`}
          </p>
        </div>
        {modo === "lista" ? (
          <button type="button" className={classeBotaoPrimario} onClick={() => setModo("nova")}>
            Nova filial
          </button>
        ) : null}
      </div>

      {modo === "nova" ? (
        <FormularioFilial
          clienteId={clienteId}
          cidadeInicial={cidade}
          ufInicial={uf}
          aoCancelar={() => setModo("lista")}
          aoSalvar={() => setModo("lista")}
        />
      ) : null}

      {emEdicao ? (
        <FormularioFilial
          key={emEdicao.id}
          clienteId={clienteId}
          filial={emEdicao}
          aoCancelar={() => setModo("lista")}
          aoSalvar={() => setModo("lista")}
        />
      ) : null}

      {modo === "lista" && filiais.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center text-muted">
          Cadastre a primeira unidade como ela aparece no PDVLegal.
        </div>
      ) : null}

      {modo === "lista" && filiais.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {filiais.map((filial) => (
              <li key={filial.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium tracking-wide">{filial.nome}</p>
                  <p className="mt-1 text-sm text-muted">{filial.endereco}</p>
                  <p className="mt-1 text-sm text-muted">
                    {filial.cnpj} · {filial.cidade}/{filial.uf}
                  </p>
                  {filial.observacoes ? (
                    <p className="mt-1 text-sm text-ink/80">{filial.observacoes}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Selo valor={filial.status} tipo="filial" />
                  <button type="button" className={classeBotaoSecundario} onClick={() => setModo(filial.id)}>
                    Editar
                  </button>
                  <BotaoExcluir
                    url={`/api/filiais/${filial.id}`}
                    rotulo="Excluir"
                    mensagem={`Excluir a filial ${filial.nome}? Esta ação não pode ser desfeita.`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
