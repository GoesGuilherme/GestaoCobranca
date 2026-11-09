"use client";

import { useMemo, useState } from "react";
import { compararDinheiro } from "@/lib/dinheiro";
import type { EnvioReguaLista, ReguaParaProgresso } from "@/lib/regua-progresso";
import type { PassoParaRotulo } from "@/lib/regua";
import { motivoForaDoReenvio } from "@/lib/reenvio-boleto";
import type { ResultadoClassificacaoPagador } from "@/lib/classificacao-pagador";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { textoListaFaturas } from "@/lib/periodo-faturas";
import { classeCampo } from "./campo";
import { Paginacao } from "./paginacao";
import { BarraReenvioBoletos } from "./reenvio-boletos";
import { TabelaFaturas } from "./tabela-faturas";

type Ordem = "padrao" | "vencimento" | "valor" | "cliente";

const TAMANHO = 20;

export function FaturasComControles({
  faturas,
  podeCancelar,
  mostrarCliente,
  preferencias,
  reguasEnvio,
  enviosRegua = [],
  podeEnviarRegua,
  modoTeste,
  emailLogado,
  vinculos,
  passosCliente,
  hoje,
  destaqueId,
  selos = {},
}: {
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  mostrarCliente: boolean;
  preferencias?: PreferenciasCobrancaDTO;
  reguasEnvio?: ReguaParaProgresso[];
  enviosRegua?: EnvioReguaLista[];
  podeEnviarRegua?: boolean;
  modoTeste?: boolean;
  emailLogado?: string;
  vinculos?: ClienteServicoDTO[];
  passosCliente?: PassoParaRotulo[] | null;
  hoje?: string;
  destaqueId?: string | null;
  selos?: Record<string, ResultadoClassificacaoPagador | null>;
}) {
  const [ordem, setOrdem] = useState<Ordem>("padrao");
  const [pagina, setPagina] = useState(1);
  const idsLista = faturas.map((fatura) => fatura.id).join("\n");
  const [listaVista, setListaVista] = useState(idsLista);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const listaMudou = listaVista !== idsLista;
  if (listaMudou) {
    setListaVista(idsLista);
    setSelecionados(new Set());
  }
  const marcas = listaMudou ? new Set<string>() : selecionados;

  const ordenadas = useMemo(() => {
    if (ordem === "padrao") return faturas;
    const lista = [...faturas];
    lista.sort((a, b) => {
      if (ordem === "valor") return compararDinheiro(b.valor, a.valor);
      if (ordem === "cliente") return a.nomeCliente.localeCompare(b.nomeCliente, "pt-BR");
      return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0;
    });
    return lista;
  }, [faturas, ordem]);

  const motivos = useMemo(() => {
    const mapa = new Map<string, string | null>();
    const reguas = reguasEnvio ?? [];
    for (const fatura of faturas) {
      mapa.set(fatura.id, motivoForaDoReenvio(fatura, { modoTeste: Boolean(modoTeste), reguas }));
    }
    return mapa;
  }, [faturas, modoTeste, reguasEnvio]);

  const paginaSegura = Math.min(pagina, Math.max(1, Math.ceil(ordenadas.length / TAMANHO)));
  const fatia = ordenadas.slice((paginaSegura - 1) * TAMANHO, paginaSegura * TAMANHO);
  const elegiveis = faturas.filter((fatura) => !motivos.get(fatura.id));
  const idsEnvio = elegiveis.filter((fatura) => marcas.has(fatura.id)).map((fatura) => fatura.id);
  const naPagina = new Set(fatia.map((fatura) => fatura.id));
  const foraDaPagina = idsEnvio.filter((id) => !naPagina.has(id)).length;
  const todasMarcadas = elegiveis.length > 0 && elegiveis.every((fatura) => marcas.has(fatura.id));

  function alternar(id: string, marcado: boolean) {
    if (motivos.get(id)) return;
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  function alternarTodas() {
    setSelecionados((atual) => {
      const todos = elegiveis.length > 0 && elegiveis.every((fatura) => atual.has(fatura.id));
      if (todos) return new Set();
      return new Set(elegiveis.map((fatura) => fatura.id));
    });
  }

  return (
    <div>
      {podeEnviarRegua ? (
        <BarraReenvioBoletos
          ids={idsEnvio}
          totalElegiveis={elegiveis.length}
          todasMarcadas={todasMarcadas}
          algumasMarcadas={idsEnvio.length > 0 && !todasMarcadas}
          foraDaPagina={foraDaPagina}
          modoTeste={Boolean(modoTeste)}
          emailLogado={emailLogado ?? ""}
          onAlternarTodas={alternarTodas}
          onConcluido={() => setSelecionados(new Set())}
        />
      ) : null}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          {textoListaFaturas(faturas.length)}
        </p>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Ordenar</span>
          <select
            className={classeCampo}
            value={ordem}
            aria-label="Ordenar faturas"
            onChange={(evento) => {
              setOrdem(evento.target.value as Ordem);
              setPagina(1);
            }}
          >
            <option value="padrao">Ordem da situação</option>
            <option value="vencimento">Vencimento</option>
            <option value="valor">Maior valor</option>
            <option value="cliente">Cliente</option>
          </select>
        </label>
      </div>
      <TabelaFaturas
        faturas={fatia}
        podeCancelar={podeCancelar}
        mostrarCliente={mostrarCliente}
        preferencias={preferencias}
        reguasEnvio={reguasEnvio}
        enviosRegua={enviosRegua}
        podeEnviarRegua={podeEnviarRegua}
        modoTeste={modoTeste}
        emailLogado={emailLogado}
        vinculos={vinculos}
        passosCliente={passosCliente}
        hoje={hoje}
        destaqueId={destaqueId}
        selos={selos}
        selecaoBoletos={
          podeEnviarRegua
            ? {
                marcada: (id) => marcas.has(id),
                motivo: (fatura) => motivos.get(fatura.id) ?? null,
                onAlternar: alternar,
              }
            : undefined
        }
      />
      <Paginacao pagina={paginaSegura} total={ordenadas.length} tamanho={TAMANHO} onChange={setPagina} />
    </div>
  );
}
