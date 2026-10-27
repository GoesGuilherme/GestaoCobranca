"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { formatarAliquotaCampo } from "@/lib/dinheiro";
import { FORMAS_COBRANCA } from "@/lib/rotulos";
import type { PreferenciasCobrancaDTO } from "@/lib/tipos";
import { esquemaPreferenciasCobranca, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

function percentualCampo(valor: string | null) {
  return valor ? formatarAliquotaCampo(valor) : "";
}

export function FormularioPreferenciasCobranca({ inicial }: { inicial: PreferenciasCobrancaDTO }) {
  const router = useRouter();
  const [formaCobranca, setFormaCobranca] = useState(inicial.formaCobranca);
  const [diaVencimento, setDiaVencimento] = useState(String(inicial.diaVencimento));
  const [modeloDescricao, setModeloDescricao] = useState(inicial.modeloDescricao);
  const [multaPercentual, setMultaPercentual] = useState(percentualCampo(inicial.multaPercentual));
  const [jurosPercentual, setJurosPercentual] = useState(percentualCampo(inicial.jurosPercentual));
  const [descontoPercentual, setDescontoPercentual] = useState(percentualCampo(inicial.descontoPercentual));
  const [descontoDiasAntes, setDescontoDiasAntes] = useState(
    inicial.descontoDiasAntes === null ? "" : String(inicial.descontoDiasAntes),
  );
  const [diasAntesGerar, setDiasAntesGerar] = useState(inicial.diasAntesGerar === null ? "" : String(inicial.diasAntesGerar));
  const [atualizarPendentes, setAtualizarPendentes] = useState(inicial.atualizarPendentes);
  const [modeloMensagem, setModeloMensagem] = useState(inicial.modeloMensagem);
  const [modeloAssunto, setModeloAssunto] = useState(inicial.modeloAssunto);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro("");
    setAviso("");
    const entrada = {
      formaCobranca,
      diaVencimento: Number(diaVencimento),
      modeloDescricao,
      multaPercentual,
      jurosPercentual,
      descontoPercentual,
      descontoDiasAntes: descontoDiasAntes.trim() === "" ? null : Number(descontoDiasAntes),
      diasAntesGerar: diasAntesGerar === "" ? null : Number(diasAntesGerar),
      atualizarPendentes,
      modeloMensagem,
      modeloAssunto,
    };
    const validado = esquemaPreferenciasCobranca.safeParse(entrada);
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      return;
    }
    setCampos({});
    setEnviando(true);
    const resposta = await enviarJson<{ preferencias: PreferenciasCobrancaDTO }>(
      "/api/asaas/preferencias",
      "POST",
      validado.data,
    );
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    setAviso("Preferências salvas. Os formulários de cobrança desta empresa passam a abrir com estes valores.");
    router.refresh();
  }

  return (
    <form onSubmit={salvar} className="mt-8 grid gap-4 rounded-3xl border border-line bg-card p-6">
      <div>
        <h2 className="font-display text-3xl">Preferências de cobrança</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Valem só para esta empresa e já vêm preenchidas na cobrança avulsa, na recorrência e no lote. Quem emite ainda pode mudar forma, dia, descrição e encargos na hora.
        </p>
      </div>
      {erro ? (
        <div role="alert" className="rounded-2xl border border-clay/40 bg-clay-soft px-4 py-3 text-sm text-clay">
          {erro}
        </div>
      ) : null}
      {aviso ? (
        <p role="status" className="rounded-2xl bg-leaf px-4 py-3 text-sm text-ok">
          {aviso}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Forma padrão" htmlFor="pref-forma" erro={campos.formaCobranca}>
          <select id="pref-forma" className={classeCampo} value={formaCobranca} onChange={(evento) => setFormaCobranca(evento.target.value as PreferenciasCobrancaDTO["formaCobranca"])}>
            {FORMAS_COBRANCA.map((item) => (
              <option key={item.valor} value={item.valor}>{item.rotulo}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Dia de vencimento" htmlFor="pref-dia" erro={campos.diaVencimento} dica="De 1 a 31. Meses curtos usam o último dia.">
          <input id="pref-dia" className={classeCampo} inputMode="numeric" value={diaVencimento} onChange={(evento) => setDiaVencimento(evento.target.value)} />
        </Campo>
        <Campo label="Modelo da descrição" htmlFor="pref-modelo" erro={campos.modeloDescricao} dica="Marcadores: {servico}, {cliente} e {mes}.">
          <input id="pref-modelo" className={classeCampo} value={modeloDescricao} maxLength={500} onChange={(evento) => setModeloDescricao(evento.target.value)} />
        </Campo>
        <Campo label="Gerar cobrança quantos dias antes" htmlFor="pref-antecedencia" erro={campos.diasAntesGerar} dica="O Asaas não recebe este prazo em cada assinatura. A conta gera a cobrança 7, 14 ou 40 dias antes do vencimento. O número fica guardado aqui como preferência da empresa.">
          <select id="pref-antecedencia" className={classeCampo} value={diasAntesGerar} onChange={(evento) => setDiasAntesGerar(evento.target.value)}>
            <option value="">Não informar</option>
            <option value="7">7 dias</option>
            <option value="14">14 dias</option>
            <option value="40">40 dias</option>
          </select>
        </Campo>
        <Campo label="Multa %" htmlFor="pref-multa" erro={campos.multaPercentual} dica="Em branco, a cobrança não envia multa e o Asaas mantém o padrão da conta.">
          <input id="pref-multa" className={classeCampo} inputMode="decimal" value={multaPercentual} onChange={(evento) => setMultaPercentual(evento.target.value)} placeholder="2,00" />
        </Campo>
        <Campo label="Juros % ao mês" htmlFor="pref-juros" erro={campos.jurosPercentual} dica="Em branco, a cobrança não envia juros.">
          <input id="pref-juros" className={classeCampo} inputMode="decimal" value={jurosPercentual} onChange={(evento) => setJurosPercentual(evento.target.value)} placeholder="1,00" />
        </Campo>
        <Campo label="Desconto % para pagamento antecipado" htmlFor="pref-desconto" erro={campos.descontoPercentual}>
          <input id="pref-desconto" className={classeCampo} inputMode="decimal" value={descontoPercentual} onChange={(evento) => setDescontoPercentual(evento.target.value)} placeholder="5,00" />
        </Campo>
        <Campo label="Dias antes do vencimento para o desconto" htmlFor="pref-dias-desconto" erro={campos.descontoDiasAntes} dica="0 vale até a data de vencimento. Máximo de 30 dias.">
          <input id="pref-dias-desconto" className={classeCampo} inputMode="numeric" value={descontoDiasAntes} onChange={(evento) => setDescontoDiasAntes(evento.target.value)} placeholder="0" />
        </Campo>
      </div>
      {formaCobranca === "CREDIT_CARD" ? (
        <p className="text-sm text-muted">
          No cartão, o cliente informa os dados na página do Asaas. Esta empresa não recebe o número nem o CVV.
        </p>
      ) : null}
      <Campo
        label="Mensagem para o cliente"
        htmlFor="pref-mensagem"
        erro={campos.modeloMensagem}
        dica="Marcadores: {cliente}, {servico}, {valor}, {vencimento} e {link}. Vale para WhatsApp e e-mail."
      >
        <textarea
          id="pref-mensagem"
          className={classeCampo}
          rows={4}
          maxLength={2000}
          value={modeloMensagem}
          onChange={(evento) => setModeloMensagem(evento.target.value)}
        />
      </Campo>
      <Campo label="Assunto do e-mail" htmlFor="pref-assunto" erro={campos.modeloAssunto} dica="Usa os mesmos marcadores da mensagem.">
        <input
          id="pref-assunto"
          className={classeCampo}
          maxLength={200}
          value={modeloAssunto}
          onChange={(evento) => setModeloAssunto(evento.target.value)}
        />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={atualizarPendentes} onChange={(evento) => setAtualizarPendentes(evento.target.checked)} />
        Ao mudar o valor, atualizar as cobranças em aberto
      </label>
      <div>
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar preferências"}
        </button>
      </div>
    </form>
  );
}
