"use client";

import { useState } from "react";
import { formatarAliquota, formatarReais, formatarReaisAssinado } from "@/lib/dinheiro";
import type { ServicoDTO } from "@/lib/tipos";
import { BotaoExcluir } from "./botao-excluir";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { FormularioServico } from "./formulario-servico";
import { Selo } from "./selo";

function textoVinculos(quantidade: number) {
  if (quantidade === 0) return "Nenhum vínculo";
  if (quantidade === 1) return "1 vínculo";
  return `${quantidade} vínculos`;
}

export function PainelCatalogoServicos({
  servicos,
  podeEditar,
}: {
  servicos: ServicoDTO[];
  podeEditar: boolean;
}) {
  const [modo, setModo] = useState<"lista" | "novo" | string>("lista");
  const emEdicao = servicos.find((servico) => servico.id === modo);

  return (
    <section>
      {!podeEditar ? (
        <p className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Você pode consultar o catálogo e o preço. Custo, impostos e margem ficam com o dono ou o financeiro.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          {servicos.length === 0
            ? "Nenhum serviço no catálogo."
            : servicos.length === 1
              ? "1 serviço nesta empresa."
              : `${servicos.length} serviços nesta empresa.`}
        </p>
        {podeEditar && modo === "lista" ? (
          <button type="button" className={classeBotaoPrimario} onClick={() => setModo("novo")}>
            Novo serviço
          </button>
        ) : null}
      </div>

      {modo === "novo" ? (
        <FormularioServico aoCancelar={() => setModo("lista")} aoSalvar={() => setModo("lista")} />
      ) : null}

      {emEdicao ? (
        <FormularioServico
          key={emEdicao.id}
          servico={emEdicao}
          aoCancelar={() => setModo("lista")}
          aoSalvar={() => setModo("lista")}
        />
      ) : null}

      {modo === "lista" && servicos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center text-muted">
          Cadastre o que esta empresa vende, com o preço que vale na maior parte dos clientes.
        </div>
      ) : null}

      {modo === "lista" && servicos.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {servicos.map((servico) => (
              <li
                key={servico.id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{servico.nome}</p>
                  <p className="mt-1 text-sm tabular-nums">{formatarReais(servico.precoPadrao)}</p>
                  {servico.margem ? (
                    <p className="mt-1 text-sm tabular-nums text-muted">
                      {servico.custo ? `Custo ${formatarReais(servico.custo)} · ` : null}
                      {servico.aliquotaImposto
                        ? `Impostos ${formatarAliquota(servico.aliquotaImposto)} · `
                        : null}
                      Margem {formatarReaisAssinado(servico.margem)}
                    </p>
                  ) : null}
                  {servico.descricao ? (
                    <p className="mt-1 text-sm text-muted">{servico.descricao}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted">{textoVinculos(servico.quantidadeVinculos)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Selo valor={servico.ativo ? "ATIVO" : "INATIVO"} tipo="servico" />
                  {podeEditar ? (
                    <>
                      <button
                        type="button"
                        className={classeBotaoSecundario}
                        onClick={() => setModo(servico.id)}
                      >
                        Editar
                      </button>
                      <BotaoExcluir
                        url={`/api/servicos/${servico.id}`}
                        rotulo="Excluir"
                        mensagem={
                          servico.quantidadeVinculos > 0
                            ? `Excluir ${servico.nome}? Se ainda houver cliente com este serviço, a exclusão é recusada. Nesse caso, inative o item.`
                            : `Excluir ${servico.nome} do catálogo? Esta ação não pode ser desfeita.`
                        }
                      />
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
