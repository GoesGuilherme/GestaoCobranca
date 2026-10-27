"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { descreverCobranca, PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { dataHojeIso, proximoVencimentoIso } from "@/lib/data";
import { formatarAliquotaCampo, formatarValorCampo } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { FORMAS_COBRANCA, rotuloAssinatura, rotuloCartao } from "@/lib/rotulos";
import type { ClienteServicoDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { AcoesCompartilhar } from "./acoes-compartilhar";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

function caixaErro(erro: string) {
  if (!erro) return null;
  return (
    <div role="alert" className="rounded-2xl border border-clay/40 bg-clay-soft px-4 py-3 text-sm text-clay">
      <p className="font-medium">O Asaas não concluiu a recorrência.</p>
      <p className="mt-1">{erro}</p>
    </div>
  );
}

function percentualCampo(valor: string | null) {
  return valor ? formatarAliquotaCampo(valor) : "";
}

export function AcoesRecorrencia({
  vinculo,
  nomeCliente,
  whatsapp = "",
  email = "",
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
}: {
  vinculo: ClienteServicoDTO;
  nomeCliente: string;
  whatsapp?: string;
  email?: string;
  preferencias?: PreferenciasCobrancaDTO;
}) {
  const router = useRouter();
  const assinatura = vinculo.recorrenciaAsaas;
  const ativa = assinatura?.status === "ACTIVE";
  const pausada = assinatura?.status === "INACTIVE";
  const emCurso = ativa || pausada;
  const encerrada = !emCurso;
  const [modo, setModo] = useState<"ver" | "ativar" | "editar" | "pausar" | "cancelar">("ver");
  const [dia, setDia] = useState(String(emCurso ? (assinatura?.diaVencimento ?? preferencias.diaVencimento) : preferencias.diaVencimento));
  const [valor, setValor] = useState(formatarValorCampo(vinculo.valor));
  const [forma, setForma] = useState(emCurso ? (assinatura?.formaCobranca ?? preferencias.formaCobranca) : preferencias.formaCobranca);
  const [descricaoManual, setDescricaoManual] = useState<string | null>(emCurso ? (assinatura?.descricao ?? "") : null);
  const [multa, setMulta] = useState(percentualCampo(preferencias.multaPercentual));
  const [juros, setJuros] = useState(percentualCampo(preferencias.jurosPercentual));
  const [desconto, setDesconto] = useState(percentualCampo(preferencias.descontoPercentual));
  const [diasDesconto, setDiasDesconto] = useState(preferencias.descontoDiasAntes === null ? "" : String(preferencias.descontoDiasAntes));
  const [atualizarPendentes, setAtualizarPendentes] = useState(preferencias.atualizarPendentes);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const diaNumero = Number(dia);
  const vencimento = proximoVencimentoIso(diaNumero, dataHojeIso());
  const descricaoCalculada = descreverCobranca(preferencias.modeloDescricao, {
    servico: vinculo.nomeServico,
    cliente: nomeCliente,
    vencimento: vencimento ?? "",
  });
  const descricao = descricaoManual ?? descricaoCalculada;
  const encargos = {
    multaPercentual: multa,
    jurosPercentual: juros,
    descontoPercentual: desconto,
    descontoDiasAntes: diasDesconto.trim() === "" ? null : Number(diasDesconto),
  };

  async function concluir(resposta: { ok: boolean; status?: number; erro?: string }) {
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro ?? "Não foi possível concluir a operação.");
      return;
    }
    setModo("ver");
    setErro("");
    router.refresh();
  }

  async function ativar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/servicos-cliente/${vinculo.id}/recorrencia`, "POST", {
      formaCobranca: forma,
      diaVencimento: diaNumero,
      ...(vencimento ? { proximoVencimento: vencimento } : {}),
      valor,
      descricao,
      ...encargos,
    });
    await concluir(resposta);
  }

  async function editar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/servicos-cliente/${vinculo.id}/recorrencia`, "PATCH", {
      formaCobranca: forma,
      diaVencimento: diaNumero,
      ...(vencimento ? { proximoVencimento: vencimento } : {}),
      valor,
      descricao,
      atualizarPendentes,
      ...encargos,
    });
    await concluir(resposta);
  }

  async function pausar() {
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/servicos-cliente/${vinculo.id}/recorrencia/pausa`, "POST");
    await concluir(resposta);
  }

  async function cancelar() {
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/servicos-cliente/${vinculo.id}/recorrencia`, "DELETE");
    await concluir(resposta);
  }

  async function retomar() {
    setEnviando(true);
    setErro("");
    const resposta = await enviarJson(`/api/servicos-cliente/${vinculo.id}/recorrencia/retomar`, "POST", {
      diaVencimento: diaNumero,
      ...(vencimento ? { proximoVencimento: vencimento } : {}),
    });
    await concluir(resposta);
  }

  const campos = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Valor" htmlFor={`valor-recorrencia-${vinculo.id}`}>
          <input id={`valor-recorrencia-${vinculo.id}`} className={classeCampo} inputMode="decimal" value={valor} onChange={(evento) => setValor(evento.target.value)} />
        </Campo>
        <Campo label="Dia de vencimento" htmlFor={`dia-recorrencia-${vinculo.id}`} dica={vencimento ? `Primeiro vencimento em ${formatarDataIso(vencimento)}.` : "Escolha um dia de 1 a 31."}>
          <input id={`dia-recorrencia-${vinculo.id}`} className={classeCampo} inputMode="numeric" min={1} max={31} value={dia} onChange={(evento) => setDia(evento.target.value)} />
        </Campo>
        <Campo label="Forma" htmlFor={`forma-recorrencia-${vinculo.id}`}>
          <select id={`forma-recorrencia-${vinculo.id}`} className={classeCampo} value={forma} onChange={(evento) => setForma(evento.target.value)}>
            {FORMAS_COBRANCA.map((item) => (
              <option key={item.valor} value={item.valor}>{item.rotulo}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Descrição" htmlFor={`descricao-recorrencia-${vinculo.id}`} dica="O modelo da empresa usa {servico}, {cliente} e {mes}.">
          <input
            id={`descricao-recorrencia-${vinculo.id}`}
            className={classeCampo}
            value={descricao}
            maxLength={500}
            onChange={(evento) => setDescricaoManual(evento.target.value)}
          />
        </Campo>
        <Campo label="Multa %" htmlFor={`multa-recorrencia-${vinculo.id}`} dica="Em branco, esta cobrança não envia multa.">
          <input id={`multa-recorrencia-${vinculo.id}`} className={classeCampo} inputMode="decimal" value={multa} onChange={(evento) => setMulta(evento.target.value)} placeholder="2,00" />
        </Campo>
        <Campo label="Juros % ao mês" htmlFor={`juros-recorrencia-${vinculo.id}`}>
          <input id={`juros-recorrencia-${vinculo.id}`} className={classeCampo} inputMode="decimal" value={juros} onChange={(evento) => setJuros(evento.target.value)} placeholder="1,00" />
        </Campo>
        <Campo label="Desconto %" htmlFor={`desconto-recorrencia-${vinculo.id}`} dica="Para pagamento antecipado.">
          <input id={`desconto-recorrencia-${vinculo.id}`} className={classeCampo} inputMode="decimal" value={desconto} onChange={(evento) => setDesconto(evento.target.value)} placeholder="5,00" />
        </Campo>
        <Campo label="Dias antes para o desconto" htmlFor={`dias-desconto-recorrencia-${vinculo.id}`}>
          <input id={`dias-desconto-recorrencia-${vinculo.id}`} className={classeCampo} inputMode="numeric" value={diasDesconto} onChange={(evento) => setDiasDesconto(evento.target.value)} placeholder="0" />
        </Campo>
      </div>
      {forma === "CREDIT_CARD" ? (
        <p className="text-sm text-muted">
          O cliente cadastra o cartão na página do Asaas. Esta empresa não recebe o número nem o CVV.
        </p>
      ) : null}
    </>
  );

  return (
    <div className="mt-3 w-full">
      <div className="flex flex-wrap items-center gap-2">
        {assinatura ? (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ativa ? "bg-leaf text-ok" : pausada ? "bg-gold-soft text-gold-ink" : "bg-clay-soft text-clay"}`}>
            {rotuloAssinatura(assinatura.status)}
          </span>
        ) : null}
        {assinatura?.cartaoStatus ? (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${assinatura.cartaoStatus === "CADASTRADO" ? "bg-leaf text-ok" : assinatura.cartaoStatus === "RECUSADO" ? "bg-clay-soft text-clay" : "bg-gold-soft text-gold-ink"}`}
          >
            {rotuloCartao(assinatura.cartaoStatus)}
            {assinatura.cartaoStatus === "CADASTRADO" && assinatura.cartaoFinal
              ? ` · ${assinatura.cartaoBandeira ? `${assinatura.cartaoBandeira} ` : ""}•••• ${assinatura.cartaoFinal}`
              : ""}
          </span>
        ) : null}
        {encerrada && vinculo.status === "ATIVO" && vinculo.recorrencia === "MENSAL" ? (
          <button type="button" className={classeBotaoPrimario} onClick={() => { setErro(""); setModo(modo === "ativar" ? "ver" : "ativar"); }}>
            Ativar cobrança recorrente
          </button>
        ) : null}
        {ativa || pausada ? (
          <button type="button" className={classeBotaoSecundario} onClick={() => { setErro(""); setModo(modo === "editar" ? "ver" : "editar"); }}>
            Editar recorrência
          </button>
        ) : null}
        {ativa ? (
          <button type="button" className={classeBotaoSecundario} onClick={() => { setErro(""); setModo("pausar"); }}>
            Pausar
          </button>
        ) : null}
        {pausada ? (
          <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={() => void retomar()}>
            Retomar
          </button>
        ) : null}
        {ativa || pausada ? (
          <button type="button" className={classeBotaoPerigo} onClick={() => { setErro(""); setModo("cancelar"); }}>
            Cancelar recorrência
          </button>
        ) : null}
      </div>

      {assinatura?.urlCobranca ? (
        <div className="mt-3">
          {assinatura.cartaoStatus === "RECUSADO" ? (
            <p className="mb-2 text-sm text-clay">
              O cartão foi recusado. Envie o link de novo para o cliente cadastrar outro cartão na página do Asaas.
            </p>
          ) : null}
          <AcoesCompartilhar
            link={assinatura.urlCobranca}
            whatsapp={whatsapp}
            email={email}
            cliente={nomeCliente}
            servico={vinculo.nomeServico}
            valor={vinculo.valor}
            vencimento={assinatura.proximoVencimento ?? ""}
            modeloMensagem={preferencias.modeloMensagem}
            modeloAssunto={preferencias.modeloAssunto}
          />
        </div>
      ) : null}

      {modo === "ativar" ? (
        <form onSubmit={ativar} className="mt-3 grid gap-4 rounded-2xl border border-line bg-paper p-4">
          <p className="text-sm text-muted">O Asaas passa a gerar a mensalidade neste dia. A primeira cobrança aparece pelo webhook ou em Importar faturas.</p>
          {campos}
          {caixaErro(erro)}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={classeBotaoPrimario} disabled={enviando}>{enviando ? "Ativando..." : "Ativar cobrança recorrente"}</button>
            <button type="button" className={classeBotaoSecundario} onClick={() => setModo("ver")}>Voltar</button>
          </div>
        </form>
      ) : null}

      {modo === "editar" ? (
        <form onSubmit={editar} className="mt-3 grid gap-4 rounded-2xl border border-line bg-paper p-4">
          {campos}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={atualizarPendentes} onChange={(evento) => setAtualizarPendentes(evento.target.checked)} />
            Atualizar cobranças em aberto
          </label>
          {caixaErro(erro)}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={classeBotaoPrimario} disabled={enviando}>{enviando ? "Salvando..." : "Salvar recorrência"}</button>
            <button type="button" className={classeBotaoSecundario} onClick={() => setModo("ver")}>Voltar</button>
          </div>
        </form>
      ) : null}

      {modo === "pausar" ? (
        <div className="mt-3 rounded-2xl border border-line bg-paper p-4 text-sm">
          <p>A pausa para de gerar cobranças novas. As que já existem continuam.</p>
          {caixaErro(erro)}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={classeBotaoPrimario} disabled={enviando} onClick={() => void pausar()}>{enviando ? "Pausando..." : "Confirmar pausa"}</button>
            <button type="button" className={classeBotaoSecundario} onClick={() => setModo("ver")}>Voltar</button>
          </div>
        </div>
      ) : null}

      {modo === "cancelar" ? (
        <div className="mt-3 rounded-2xl border border-line bg-paper p-4 text-sm">
          <p>Cancelar remove a assinatura no Asaas e as cobranças em aberto desta recorrência.</p>
          {caixaErro(erro)}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={classeBotaoPerigo} disabled={enviando} onClick={() => void cancelar()}>{enviando ? "Cancelando..." : "Confirmar cancelamento"}</button>
            <button type="button" className={classeBotaoSecundario} onClick={() => setModo("ver")}>Voltar</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
