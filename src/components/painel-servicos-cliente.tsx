"use client";

import Link from "next/link";
import { useState } from "react";
import { formatarDataIso } from "@/lib/formatacao";
import { formatarAliquota, formatarReais, formatarReaisAssinado, somarDinheiro } from "@/lib/dinheiro";
import { rotuloRecorrencia } from "@/lib/rotulos";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import type { ClienteServicoDTO, PreferenciasCobrancaDTO, ServicoDTO } from "@/lib/tipos";
import { AcoesRecorrencia } from "./acoes-recorrencia";
import { BotaoExcluir } from "./botao-excluir";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { FormularioClienteServico } from "./formulario-cliente-servico";
import { Selo } from "./selo";

function total(vinculos: ClienteServicoDTO[], recorrencia: "MENSAL" | "AVULSO") {
  return somarDinheiro(
    vinculos
      .filter((item) => item.status === "ATIVO" && item.recorrencia === recorrencia)
      .map((item) => item.valor),
  );
}

export function PainelServicosCliente({
  clienteId,
  vinculos,
  catalogo,
  podeEditar,
  podeCobrar = false,
  nomeCliente,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
}: {
  clienteId: string;
  vinculos: ClienteServicoDTO[];
  catalogo: ServicoDTO[];
  podeEditar: boolean;
  podeCobrar?: boolean;
  nomeCliente: string;
  preferencias?: PreferenciasCobrancaDTO;
}) {
  const [modo, setModo] = useState<"lista" | "novo" | string>("lista");
  const emEdicao = vinculos.find((item) => item.id === modo);
  const temAtivoNoCatalogo = catalogo.some((servico) => servico.ativo);

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Serviços vendidos</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            O que esta empresa cobra deste cliente. O valor combinado e o custo desta venda não mudam se o catálogo mudar. A alíquota continua no serviço.
          </p>
        </div>
        {podeEditar && modo === "lista" ? (
          <button type="button" className={classeBotaoPrimario} onClick={() => setModo("novo")}>
            Vender serviço
          </button>
        ) : null}
      </div>

      {!podeEditar ? (
        <p className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
          Você pode consultar o preço cobrado. Custo, impostos e margem ficam com o dono ou o financeiro.
        </p>
      ) : null}

      {modo === "novo" ? (
        <div className="mb-4">
          <FormularioClienteServico
            clienteId={clienteId}
            catalogo={catalogo}
            aoCancelar={() => setModo("lista")}
            aoSalvar={() => setModo("lista")}
          />
        </div>
      ) : null}

      {emEdicao ? (
        <div className="mb-4">
          <FormularioClienteServico
            key={emEdicao.id}
            clienteId={clienteId}
            vinculo={emEdicao}
            catalogo={catalogo}
            aoCancelar={() => setModo("lista")}
            aoSalvar={() => setModo("lista")}
          />
        </div>
      ) : null}

      {vinculos.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-3xl border border-line bg-card px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Mensal ativo</p>
            <p className="mt-2 font-display text-3xl tabular-nums">{formatarReais(total(vinculos, "MENSAL"))}</p>
          </article>
          <article className="rounded-3xl border border-line bg-card px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Avulsos ativos</p>
            <p className="mt-2 font-display text-3xl tabular-nums">{formatarReais(total(vinculos, "AVULSO"))}</p>
          </article>
        </div>
      ) : null}

      {modo === "lista" && vinculos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center text-muted">
          {temAtivoNoCatalogo
            ? "Nenhum serviço vinculado. Informe o valor combinado com este cliente."
            : "O catálogo ainda não tem um serviço ativo."}{" "}
          {!temAtivoNoCatalogo && podeEditar ? (
            <Link href="/servicos" className="font-medium text-canopy hover:underline">
              Abrir o catálogo
            </Link>
          ) : null}
        </div>
      ) : null}

      {modo === "lista" && vinculos.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-line bg-card">
          <ul className="divide-y divide-line">
            {vinculos.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{item.nomeServico}</p>
                  <p className="mt-1 text-sm tabular-nums">
                    {formatarReais(item.valor)} · {rotuloRecorrencia(item.recorrencia)} · desde{" "}
                    {formatarDataIso(item.inicioEm)}
                  </p>
                  {item.margem ? (
                    <p className="mt-1 text-sm tabular-nums text-muted">
                      {item.custo ? `Custo ${formatarReais(item.custo)} · ` : null}
                      {item.aliquotaImposto ? `Impostos ${formatarAliquota(item.aliquotaImposto)} · ` : null}
                      Margem {formatarReaisAssinado(item.margem)} sobre o valor combinado
                    </p>
                  ) : null}
                  {item.observacoes ? <p className="mt-1 text-sm text-ink/80">{item.observacoes}</p> : null}
                  {podeCobrar && (item.recorrencia === "MENSAL" || item.recorrenciaAsaas) ? (
                    <AcoesRecorrencia vinculo={item} nomeCliente={nomeCliente} preferencias={preferencias} />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Selo valor={item.status} tipo="servico" />
                  {podeEditar ? (
                    <>
                      <button
                        type="button"
                        className={classeBotaoSecundario}
                        onClick={() => setModo(item.id)}
                      >
                        Editar
                      </button>
                      <BotaoExcluir
                        url={`/api/servicos-cliente/${item.id}`}
                        rotulo="Excluir"
                        mensagem={`Remover ${item.nomeServico} deste cliente? O serviço continua no catálogo.`}
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
