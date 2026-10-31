"use client";

import { useState } from "react";
import { formatarAliquota, formatarReais, formatarReaisAssinado } from "@/lib/dinheiro";
import type { ServicoDTO } from "@/lib/tipos";
import { BotaoExcluir } from "./botao-excluir";
import { classeCampo } from "./campo";
import { EstadoVazio } from "./estado-vazio";
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
  const [busca, setBusca] = useState("");
  const emEdicao = servicos.find((servico) => servico.id === modo);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = termo
    ? servicos.filter((servico) =>
        `${servico.nome} ${servico.descricao ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo),
      )
    : servicos;

  return (
    <section>
      {!podeEditar ? (
        <p className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Você pode consultar o catálogo e o preço. Custo, impostos e margem ficam com o dono ou o financeiro.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-2 sm:max-w-sm">
          <label htmlFor="busca-servico" className="text-sm font-medium">
            Buscar serviço
          </label>
          <input
            id="busca-servico"
            className={classeCampo}
            value={busca}
            placeholder="Nome ou descrição"
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </div>
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

      {modo === "lista" ? (
        <p className="mb-3 text-sm text-muted">
          {visiveis.length === servicos.length
            ? servicos.length === 1
              ? "1 serviço nesta empresa."
              : `${servicos.length} serviços nesta empresa.`
            : `${visiveis.length} de ${servicos.length} serviços.`}
        </p>
      ) : null}

      {modo === "lista" && visiveis.length === 0 ? (
        <EstadoVazio
          titulo={termo ? "Nenhum serviço encontrado" : "Nenhum serviço no catálogo"}
          descricao={
            termo
              ? "Tente outro nome ou limpe a busca."
              : "Cadastre o que esta empresa vende, com o preço que vale na maior parte dos clientes."
          }
        />
      ) : null}

      {modo === "lista" && visiveis.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {visiveis.map((servico) => (
              <li
                key={servico.id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{servico.nome}</p>
                  <p className="mt-1 text-sm tabular-nums">{formatarReais(servico.precoPadrao)}</p>
                  {servico.margem ? (
                    <p className="mt-1 text-sm tabular-nums text-muted">
                      {servico.custo ? `Custo padrão ${formatarReais(servico.custo)} · ` : null}
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
