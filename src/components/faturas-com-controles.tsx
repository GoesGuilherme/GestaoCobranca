"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { compararDinheiro } from "@/lib/dinheiro";
import { LIMITE_REENVIO_BOLETOS } from "@/lib/validacao";
import { motivoForaDaSelecaoBoleto, textoResultadoReenvio } from "@/lib/reenvio-boleto";
import type { EnvioReguaLista, ReguaParaProgresso } from "@/lib/regua-progresso";
import type { PassoParaRotulo } from "@/lib/regua";
import type { ResultadoClassificacaoPagador } from "@/lib/classificacao-pagador";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO, ResultadoReenvioBoletos } from "@/lib/tipos";
import { textoListaFaturas } from "@/lib/periodo-faturas";
import { classeCampo } from "./campo";
import { DialogoConfirmacao } from "./dialogo-confirmacao";
import { classeBotaoSecundario } from "./estilos";
import { Paginacao } from "./paginacao";
import { TabelaFaturas } from "./tabela-faturas";
import { avisarErro } from "./notificador";

type Ordem = "padrao" | "vencimento" | "valor" | "cliente";

const TAMANHO = 20;

function textoConfirmacao(quantidade: number, modoTeste: boolean) {
  const n = quantidade === 1 ? "1 boleto" : `${quantidade} boletos`;
  const base = `Reenviar o aviso de emissão de ${n}. O e-mail usa o passo Na emissão da régua. O WhatsApp sai só se esse passo estiver ligado, e boleto que já está na fila não entra de novo.`;
  return modoTeste ? `${base} Modo teste ligado: nada vai para o cliente.` : base;
}

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
  const router = useRouter();
  const [ordem, setOrdem] = useState<Ordem>("padrao");
  const [pagina, setPagina] = useState(1);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoReenvioBoletos | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);

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

  const paginaSegura = Math.min(pagina, Math.max(1, Math.ceil(ordenadas.length / TAMANHO)));
  const fatia = ordenadas.slice((paginaSegura - 1) * TAMANHO, paginaSegura * TAMANHO);
  const idsDaLista = faturas.map((fatura) => fatura.id).join("\n");
  const elegiveis = useMemo(
    () => ordenadas.filter((fatura) => !motivoForaDaSelecaoBoleto(fatura)).map((fatura) => fatura.id),
    [ordenadas],
  );
  const escolhidasSet = useMemo(() => new Set(escolhidas), [escolhidas]);
  const todasElegiveis = elegiveis.length > 0 && elegiveis.every((id) => escolhidasSet.has(id));
  const textoReenvio = resultado ? textoResultadoReenvio(resultado.itens) : null;

  useEffect(() => {
    setEscolhidas([]);
    setResultado(null);
    setAvisoParcial(null);
  }, [idsDaLista]);

  function alternar(id: string) {
    setEscolhidas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  function alternarVarios(ids: string[], marcar: boolean) {
    setEscolhidas((atual) => {
      const conjunto = new Set(atual);
      for (const id of ids) {
        if (marcar) conjunto.add(id);
        else conjunto.delete(id);
      }
      return [...conjunto];
    });
  }

  async function reenviar() {
    const ids = elegiveis.filter((id) => escolhidasSet.has(id));
    if (ids.length === 0) return;
    setEnviando(true);
    setAvisoParcial(null);
    const itens: ResultadoReenvioBoletos["itens"] = [];
    let modoTeste = false;
    for (let inicio = 0; inicio < ids.length; inicio += LIMITE_REENVIO_BOLETOS) {
      const resposta = await enviarJson<ResultadoReenvioBoletos>("/api/faturas/reenviar-boletos", "POST", {
        ids: ids.slice(inicio, inicio + LIMITE_REENVIO_BOLETOS),
      });
      if (!resposta.ok) {
        setEnviando(false);
        setConfirmar(false);
        if (resposta.status === 401) {
          router.push("/login");
          return;
        }
        if (itens.length > 0) {
          setResultado({ modoTeste, itens });
          setAvisoParcial(resposta.erro);
          setEscolhidas([]);
          router.refresh();
          return;
        }
        avisarErro(resposta.erro);
        return;
      }
      modoTeste = resposta.dados.modoTeste;
      itens.push(...resposta.dados.itens);
    }
    setEnviando(false);
    setConfirmar(false);
    setResultado({ modoTeste, itens });
    setEscolhidas([]);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {textoListaFaturas(faturas.length)}
          </p>
          {podeEnviarRegua ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={todasElegiveis}
                  disabled={elegiveis.length === 0 || enviando}
                  aria-label="Selecionar boletos da lista"
                  ref={(elemento) => {
                    if (elemento) elemento.indeterminate = escolhidas.length > 0 && !todasElegiveis;
                  }}
                  onChange={(evento) => alternarVarios(elegiveis, evento.target.checked)}
                />
                Selecionar boletos
              </label>
              <button
                type="button"
                className={classeBotaoSecundario}
                disabled={escolhidas.length === 0 || enviando}
                onClick={() => setConfirmar(true)}
              >
                Reenviar boletos
              </button>
              {escolhidas.length > 0 ? (
                <span className="text-sm text-muted">
                  {escolhidas.length === 1 ? "1 selecionado" : `${escolhidas.length} selecionados`}
                </span>
              ) : null}
            </div>
          ) : null}
          {podeEnviarRegua ? (
            <p className="mt-1 text-xs text-muted">Só boleto em aberto. Pix e cartão ficam de fora.</p>
          ) : null}
        </div>
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
      {textoReenvio && resultado ? (
        <div role="status" className="mb-4 rounded-2xl border border-line bg-card px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">Resultado do reenvio</p>
            <button type="button" className="text-xs font-medium text-canopy underline" onClick={() => setResultado(null)}>
              Fechar
            </button>
          </div>
          <p className="mt-1 leading-6">{textoReenvio.resumo}</p>
          {resultado.modoTeste ? (
            <p className="mt-1 text-muted">Modo teste ligado. O e-mail foi para quem está logado, não para o cliente.</p>
          ) : null}
          {avisoParcial ? <p className="mt-1 text-clay">{avisoParcial} O que já tinha sido aceito continua valendo.</p> : null}
          {textoReenvio.detalhes.length > 0 ? (
            <ul className="mt-2 space-y-1 text-muted">
              {textoReenvio.detalhes.slice(0, 12).map((linha) => (
                <li key={linha}>{linha}</li>
              ))}
              {textoReenvio.detalhes.length > 12 ? <li>E mais {textoReenvio.detalhes.length - 12}.</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
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
        selecao={
          podeEnviarRegua
            ? { escolhidas: escolhidasSet, onAlternar: alternar, onAlternarVarios: alternarVarios }
            : undefined
        }
      />
      <DialogoConfirmacao
        aberto={confirmar}
        titulo="Reenviar boletos"
        descricao={textoConfirmacao(elegiveis.filter((id) => escolhidasSet.has(id)).length, Boolean(modoTeste))}
        confirmarRotulo="Reenviar"
        enviando={enviando}
        onCancelar={() => {
          if (!enviando) setConfirmar(false);
        }}
        onConfirmar={() => void reenviar()}
      />
      <Paginacao pagina={paginaSegura} total={ordenadas.length} tamanho={TAMANHO} onChange={setPagina} />
    </div>
  );
}
