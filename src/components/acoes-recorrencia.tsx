"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { dataHojeIso, proximoVencimentoIso } from "@/lib/data";
import { formatarValorCampo } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { FORMAS_COBRANCA, rotuloAssinatura } from "@/lib/rotulos";
import type { ClienteServicoDTO } from "@/lib/tipos";
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

export function AcoesRecorrencia({ vinculo }: { vinculo: ClienteServicoDTO }) {
  const router = useRouter();
  const assinatura = vinculo.recorrenciaAsaas;
  const ativa = assinatura?.status === "ACTIVE";
  const pausada = assinatura?.status === "INACTIVE";
  const encerrada = !assinatura || assinatura.status === "CANCELADA" || assinatura.status === "EXPIRED";
  const [modo, setModo] = useState<"ver" | "ativar" | "editar" | "pausar" | "cancelar">("ver");
  const [dia, setDia] = useState(String(assinatura?.diaVencimento ?? (Number(vinculo.inicioEm.slice(8, 10)) || 10)));
  const [valor, setValor] = useState(formatarValorCampo(vinculo.valor));
  const [forma, setForma] = useState(assinatura?.formaCobranca ?? "BOLETO");
  const [descricao, setDescricao] = useState(assinatura?.descricao ?? `Mensalidade ${vinculo.nomeServico}`);
  const [atualizarPendentes, setAtualizarPendentes] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const diaNumero = Number(dia);
  const vencimento = proximoVencimentoIso(diaNumero, dataHojeIso());

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
        <Campo label="Descrição" htmlFor={`descricao-recorrencia-${vinculo.id}`}>
          <input id={`descricao-recorrencia-${vinculo.id}`} className={classeCampo} value={descricao} maxLength={500} onChange={(evento) => setDescricao(evento.target.value)} />
        </Campo>
      </div>
    </>
  );

  return (
    <div className="mt-3 w-full">
      <div className="flex flex-wrap items-center gap-2">
        {assinatura ? (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ativa ? "bg-leaf text-forest" : pausada ? "bg-gold-soft text-gold" : "bg-clay-soft text-clay"}`}>
            {rotuloAssinatura(assinatura.status)}
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
