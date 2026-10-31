"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { descreverCobranca, PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { formatarAliquotaCampo, formatarReais, somarDinheiro } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { FORMAS_COBRANCA } from "@/lib/rotulos";
import { textoResultadoLote, tomDoLote, type FalhaLoteVisivel } from "@/lib/textos-feedback";
import type { PreferenciasCobrancaDTO, PreviaRecorrencia, ResultadoLoteRecorrencia } from "@/lib/tipos";
import { Aviso } from "./aviso";
import { Campo, classeCampo } from "./campo";
import { DialogoConfirmacao } from "./dialogo-confirmacao";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

function percentualCampo(valor: string | null) {
  return valor ? formatarAliquotaCampo(valor) : "";
}

export function PainelRecorrenciaLote({
  clienteId,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
}: {
  clienteId?: string;
  preferencias?: PreferenciasCobrancaDTO;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState(String(preferencias.diaVencimento));
  const [forma, setForma] = useState<string>(preferencias.formaCobranca);
  const [modelo, setModelo] = useState(preferencias.modeloDescricao);
  const [multa, setMulta] = useState(percentualCampo(preferencias.multaPercentual));
  const [juros, setJuros] = useState(percentualCampo(preferencias.jurosPercentual));
  const [desconto, setDesconto] = useState(percentualCampo(preferencias.descontoPercentual));
  const [diasDesconto, setDiasDesconto] = useState(
    preferencias.descontoDiasAntes === null ? "" : String(preferencias.descontoDiasAntes),
  );
  const [previa, setPrevia] = useState<PreviaRecorrencia | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const chaveResultado = `taguaro-lote-recorrencia-${clienteId ?? "todos"}`;
  const [resultado, setResultado] = useState<{ vencimento: string; criadas: number; falhas: FalhaLoteVisivel[] } | null>(null);

  useEffect(() => {
    const salvo = sessionStorage.getItem(chaveResultado);
    if (!salvo) return;
    try {
      setResultado(JSON.parse(salvo) as { vencimento: string; criadas: number; falhas: FalhaLoteVisivel[] });
    } catch {
      sessionStorage.removeItem(chaveResultado);
    }
  }, [chaveResultado]);
  const [pedirConfirmacao, setPedirConfirmacao] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function carregar(diaInformado = dia) {
    setErro("");
    const consulta = new URLSearchParams({ dia: diaInformado });
    if (clienteId) consulta.set("clienteId", clienteId);
    const resposta = await fetch(`/api/recorrencias/lote?${consulta.toString()}`);
    const dados = (await resposta.json().catch(() => ({}))) as PreviaRecorrencia & { erro?: string };
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setPrevia(null);
      setErro(dados.erro ?? "Não foi possível montar a prévia.");
      return;
    }
    setPrevia(dados);
    setEscolhidos(dados.itens.map((item) => item.id));
  }

  function abrir() {
    setAberto(true);
    void carregar(dia);
  }

  function alternar(id: string) {
    setEscolhidos((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  async function confirmar() {
    if (enviando || !previa || escolhidos.length === 0) return;
    setPedirConfirmacao(false);
    setEnviando(true);
    setErro("");
    const nomes = new Map(previa.itens.map((item) => [item.id, `${item.nomeCliente} · ${item.nomeServico}`]));
    const resposta = await enviarJson<ResultadoLoteRecorrencia>("/api/recorrencias/lote", "POST", {
      diaVencimento: previa.diaVencimento,
      formaCobranca: forma,
      modeloDescricao: modelo,
      multaPercentual: multa,
      jurosPercentual: juros,
      descontoPercentual: desconto,
      descontoDiasAntes: diasDesconto.trim() === "" ? null : Number(diasDesconto),
      ...(clienteId ? { clienteId } : {}),
      ids: escolhidos,
    });
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      return;
    }
    const visivel = {
      criadas: resposta.dados.criadas,
      vencimento: resposta.dados.vencimento,
      falhas: resposta.dados.falhas.map((item) => ({
        id: item.id,
        nome: nomes.get(item.id) ?? "Venda mensal",
        erro: item.erro,
      })),
    };
    setResultado(visivel);
    sessionStorage.setItem(chaveResultado, JSON.stringify(visivel));
    router.refresh();
    await carregar(String(previa.diaVencimento));
  }

  const selecionados = previa?.itens.filter((item) => escolhidos.includes(item.id)) ?? [];
  const totalSelecionado = selecionados.length > 0 ? somarDinheiro(selecionados.map((item) => item.valor)) : null;

  return (
    <section className="mt-8">
      {resultado ? (
        <div className="mb-4">
          <Aviso
            tom={tomDoLote(resultado.criadas, resultado.falhas.length)}
            titulo={textoResultadoLote(resultado.criadas, resultado.falhas.length)}
            onFechar={() => {
              setResultado(null);
              sessionStorage.removeItem(chaveResultado);
            }}
          >
            <p>Primeiro vencimento em {formatarDataIso(resultado.vencimento)}. Este resultado fica aqui até você fechar.</p>
            {resultado.falhas.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {resultado.falhas.map((falha) => (
                  <li key={falha.id}>
                    <span className="font-medium">{falha.nome}.</span> {falha.erro}
                  </li>
                ))}
              </ul>
            ) : null}
          </Aviso>
        </div>
      ) : null}
      <DialogoConfirmacao
        aberto={pedirConfirmacao}
        titulo="Criar estas assinaturas no Asaas?"
        descricao="Cada venda escolhida passa a gerar cobrança todo mês. Nada é desfeito por este botão."
        confirmarRotulo={enviando ? "Criando..." : "Criar assinaturas"}
        enviando={enviando}
        onCancelar={() => setPedirConfirmacao(false)}
        onConfirmar={() => void confirmar()}
      >
        {previa && totalSelecionado ? (
          <p>
            {selecionados.length === 1 ? "1 venda" : `${selecionados.length} vendas`}, no total de{" "}
            {formatarReais(totalSelecionado)}, com primeiro vencimento em {formatarDataIso(previa.vencimento)}.
          </p>
        ) : null}
      </DialogoConfirmacao>
      {!aberto ? (
        <button type="button" className={classeBotaoSecundario} onClick={abrir}>
          Ativar recorrência em lote
        </button>
      ) : (
        <div className="rounded-3xl border border-line bg-card p-6">
          <h2 className="font-display text-3xl">Ativar recorrência em lote</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Vendas mensais ativas que ainda não têm assinatura. O mesmo dia vale para todas. Nada é criado antes da confirmação.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Campo label="Dia de vencimento" htmlFor="dia-lote">
              <input
                id="dia-lote"
                className={classeCampo}
                inputMode="numeric"
                value={dia}
                onChange={(evento) => {
                  setDia(evento.target.value);
                  if (/^\d+$/.test(evento.target.value)) void carregar(evento.target.value);
                }}
              />
            </Campo>
            <Campo label="Forma" htmlFor="forma-lote">
              <select id="forma-lote" className={classeCampo} value={forma} onChange={(evento) => setForma(evento.target.value)}>
                {FORMAS_COBRANCA.map((item) => (
                  <option key={item.valor} value={item.valor}>{item.rotulo}</option>
                ))}
              </select>
            </Campo>
            {forma === "CREDIT_CARD" ? (
              <p className="text-sm text-muted sm:col-span-2">
                O cliente cadastra o cartão na página do Asaas. Esta empresa não recebe o número nem o CVV.
              </p>
            ) : null}
            <Campo label="Modelo da descrição" htmlFor="modelo-lote" dica="Marcadores: {servico}, {cliente} e {mes}.">
              <input id="modelo-lote" className={classeCampo} value={modelo} maxLength={500} onChange={(evento) => setModelo(evento.target.value)} />
            </Campo>
            <Campo label="Multa %" htmlFor="multa-lote" dica="Em branco, o lote não envia multa.">
              <input id="multa-lote" className={classeCampo} inputMode="decimal" value={multa} onChange={(evento) => setMulta(evento.target.value)} />
            </Campo>
            <Campo label="Juros % ao mês" htmlFor="juros-lote">
              <input id="juros-lote" className={classeCampo} inputMode="decimal" value={juros} onChange={(evento) => setJuros(evento.target.value)} />
            </Campo>
            <Campo label="Desconto %" htmlFor="desconto-lote">
              <input id="desconto-lote" className={classeCampo} inputMode="decimal" value={desconto} onChange={(evento) => setDesconto(evento.target.value)} />
            </Campo>
            <Campo label="Dias antes para o desconto" htmlFor="dias-desconto-lote">
              <input id="dias-desconto-lote" className={classeCampo} inputMode="numeric" value={diasDesconto} onChange={(evento) => setDiasDesconto(evento.target.value)} />
            </Campo>
          </div>
          {previa ? (
            <p className="mt-3 text-sm">Primeiro vencimento em {formatarDataIso(previa.vencimento)}.</p>
          ) : null}
          {previa && previa.itens.length > 0 ? (
            <>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={escolhidos.length === previa.itens.length}
                  onChange={(evento) => setEscolhidos(evento.target.checked ? previa.itens.map((item) => item.id) : [])}
                />
                Selecionar todas
              </label>
              <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
                {previa.itens.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={escolhidos.includes(item.id)} onChange={() => alternar(item.id)} />
                      <span>
                        <span className="font-medium">{item.nomeCliente}</span>
                        <span className="text-muted"> · {item.nomeServico}</span>
                        <span className="block text-muted">
                          {descreverCobranca(modelo, {
                            servico: item.nomeServico,
                            cliente: item.nomeCliente,
                            vencimento: previa.vencimento,
                          })}
                        </span>
                      </span>
                    </label>
                    <span className="tabular-nums">{formatarReais(item.valor)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Nenhuma venda mensal ativa sem recorrência.</p>
          )}
          {erro ? (
            <div className="mt-4">
              <Aviso tom="erro" titulo="O Asaas não ativou o lote.">
                <p>{erro}</p>
              </Aviso>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={classeBotaoPrimario}
              disabled={enviando || escolhidos.length === 0}
              onClick={() => setPedirConfirmacao(true)}
            >
              {enviando ? "Criando..." : "Confirmar e criar as assinaturas"}
            </button>
            <button type="button" className={classeBotaoSecundario} onClick={() => setAberto(false)}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
}
