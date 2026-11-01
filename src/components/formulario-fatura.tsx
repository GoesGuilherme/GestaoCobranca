"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { faturaInicial, valoresAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { dataHojeIso } from "@/lib/data";
import { formatarReais, normalizarDinheiro } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";
import { mascararMoedaDigitando } from "@/lib/mascaras";
import { FORMAS_COBRANCA, rotuloFormaCobranca } from "@/lib/rotulos";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { esquemaFatura, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { DialogoConfirmacao } from "./dialogo-confirmacao";
import { classeBotaoPrimario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

export function FormularioFatura({
  clienteId,
  vinculos,
  onEmitida,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
}: {
  clienteId: string;
  vinculos: ClienteServicoDTO[];
  onEmitida?: (fatura: FaturaDTO) => void;
  preferencias?: PreferenciasCobrancaDTO;
}) {
  const router = useRouter();
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(dataHojeIso());
  const [formaCobranca, setFormaCobranca] = useState<string>(preferencias.formaCobranca);
  const [descricao, setDescricao] = useState("");
  const [clienteServicoId, setClienteServicoId] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const chaveEmissao = useRef("");

  function entradaAtual() {
    if (!chaveEmissao.current) chaveEmissao.current = globalThis.crypto.randomUUID();
    return {
      valor,
      vencimento,
      formaCobranca,
      descricao,
      clienteServicoId: clienteServicoId || undefined,
      chaveIdempotencia: chaveEmissao.current,
    };
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const validado = esquemaFatura.safeParse(entradaAtual());
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      setConfirmar(false);
      avisarCamposObrigatorios();
      return;
    }
    setCampos({});
    setConfirmar(true);
  }

  async function emitir() {
    if (enviando) return;
    const validado = esquemaFatura.safeParse(entradaAtual());
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      setConfirmar(false);
      avisarCamposObrigatorios();
      return;
    }
    setConfirmar(false);
    setEnviando(true);
    const resposta = await enviarJson<{ fatura: FaturaDTO }>(`/api/clientes/${clienteId}/faturas`, "POST", validado.data);
    setEnviando(false);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    const limpa = valoresAposSalvar("criar", { valor, vencimento, formaCobranca, descricao, clienteServicoId }, faturaInicial(preferencias.formaCobranca, dataHojeIso()));
    setValor(limpa.valor);
    setVencimento(limpa.vencimento);
    setFormaCobranca(limpa.formaCobranca);
    setDescricao(limpa.descricao);
    setClienteServicoId(limpa.clienteServicoId);
    chaveEmissao.current = "";
    avisarSucesso("Fatura criada");
    if (resposta.dados.fatura) onEmitida?.(resposta.dados.fatura);
    router.refresh();
  }

  const valorNormal = normalizarDinheiro(valor);

  return (
    <form onSubmit={enviar} className="mt-4 grid gap-4 rounded-3xl border border-line bg-card p-6">
      <DialogoConfirmacao
        aberto={confirmar}
        titulo="Emitir esta cobrança?"
        descricao="O Asaas gera a cobrança para o cliente. Confira valor, vencimento e forma antes de continuar."
        confirmarRotulo="Emitir cobrança"
        enviando={enviando}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => void emitir()}
      >
        <p>
          {valorNormal ? formatarReais(valorNormal) : valor} com vencimento em {formatarDataIso(vencimento)}, por{" "}
          {rotuloFormaCobranca(formaCobranca)}.
        </p>
      </DialogoConfirmacao>
      <h3 className="font-display text-2xl">Emitir cobrança avulsa</h3>
      <p className="text-sm text-muted">
        O cliente é criado no Asaas na primeira cobrança, ou reaproveitado se o CPF/CNPJ já existir lá. Multa, juros e desconto seguem as preferências desta empresa.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Valor" htmlFor="valor-fatura" erro={campos.valor}>
          <input id="valor-fatura" className={classeCampo} inputMode="decimal" value={valor} onChange={(evento) => setValor(mascararMoedaDigitando(evento.target.value))} placeholder="189,90" />
        </Campo>
        <Campo label="Vencimento" htmlFor="vencimento-fatura" erro={campos.vencimento}>
          <input id="vencimento-fatura" type="date" className={classeCampo} value={vencimento} onChange={(evento) => setVencimento(evento.target.value)} />
        </Campo>
        <Campo label="Forma" htmlFor="forma-fatura" erro={campos.formaCobranca}>
          <select id="forma-fatura" className={classeCampo} value={formaCobranca} onChange={(evento) => setFormaCobranca(evento.target.value)}>
            {FORMAS_COBRANCA.map((forma) => (
              <option key={forma.valor} value={forma.valor}>
                {forma.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Serviço vendido" htmlFor="vinculo-fatura" dica="Opcional. A cobrança avulsa não cria assinatura.">
          <select id="vinculo-fatura" className={classeCampo} value={clienteServicoId} onChange={(evento) => setClienteServicoId(evento.target.value)}>
            <option value="">Sem vínculo</option>
            {vinculos.map((vinculo) => (
              <option key={vinculo.id} value={vinculo.id}>
                {vinculo.nomeServico}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {formaCobranca === "CREDIT_CARD" ? (
        <p className="text-sm text-muted">
          O cliente cadastra o cartão na página do Asaas. Esta empresa não recebe o número nem o CVV.
        </p>
      ) : null}
      <Campo label="Descrição" htmlFor="descricao-fatura" erro={campos.descricao}>
        <input id="descricao-fatura" className={classeCampo} value={descricao} onChange={(evento) => setDescricao(evento.target.value)} maxLength={500} />
      </Campo>
      <div>
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Emitindo..." : "Emitir cobrança"}
        </button>
      </div>
    </form>
  );
}
