"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { dataHojeIso } from "@/lib/data";
import { FORMAS_COBRANCA } from "@/lib/rotulos";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { esquemaFatura, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

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
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const chaveEmissao = useRef("");

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro("");
    if (!chaveEmissao.current) chaveEmissao.current = globalThis.crypto.randomUUID();
    const chave = chaveEmissao.current;
    const entrada = {
      valor,
      vencimento,
      formaCobranca,
      descricao,
      clienteServicoId: clienteServicoId || undefined,
      chaveIdempotencia: chave,
    };
    const validado = esquemaFatura.safeParse(entrada);
    if (!validado.success) {
      setCampos(mensagensDoZod(validado.error));
      return;
    }
    setCampos({});
    setEnviando(true);
    const resposta = await enviarJson<{ fatura: FaturaDTO }>(`/api/clientes/${clienteId}/faturas`, "POST", validado.data);
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
    setValor("");
    setDescricao("");
    chaveEmissao.current = "";
    if (resposta.dados.fatura) onEmitida?.(resposta.dados.fatura);
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="mt-4 grid gap-4 rounded-3xl border border-line bg-card p-6">
      <h3 className="font-display text-2xl">Emitir cobrança avulsa</h3>
      <p className="text-sm text-muted">
        O cliente é criado no Asaas na primeira cobrança, ou reaproveitado se o CPF/CNPJ já existir lá. Multa, juros e desconto seguem as preferências desta empresa.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Valor" htmlFor="valor-fatura" erro={campos.valor}>
          <input id="valor-fatura" className={classeCampo} inputMode="decimal" value={valor} onChange={(evento) => setValor(evento.target.value)} placeholder="189,90" />
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
      {erro ? (
        <div role="alert" className="rounded-2xl border border-clay/40 bg-clay-soft px-4 py-3 text-sm text-clay">
          <p className="font-medium">O Asaas não emitiu a cobrança.</p>
          <p className="mt-1">{erro}</p>
        </div>
      ) : null}
      <div>
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Emitindo..." : "Emitir cobrança"}
        </button>
      </div>
    </form>
  );
}
