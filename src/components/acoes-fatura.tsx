"use client";

import { useState } from "react";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { formatarDiaMes } from "@/lib/formatacao";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { AcoesCompartilhar } from "./acoes-compartilhar";
import { AcoesLembrete } from "./acoes-lembrete";
import { BotaoCancelarFatura } from "./botao-cancelar-fatura";
import { classeBotaoSecundario } from "./estilos";

export function recorrenciaAtivaDaFatura(fatura: FaturaDTO, vinculos: ClienteServicoDTO[]) {
  if (!fatura.clienteServicoId || fatura.excluida) return null;
  const vinculo = vinculos.find((item) => item.id === fatura.clienteServicoId);
  if (!vinculo || vinculo.status !== "ATIVO" || vinculo.recorrenciaAsaas?.status !== "ACTIVE") return null;
  return {
    vinculoId: vinculo.id,
    proximoVencimento: vinculo.recorrenciaAsaas.proximoVencimento,
  };
}

export function AcoesFatura({
  fatura,
  podeCancelar,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
  passosRegua = [],
  podeEnviarRegua = false,
  vinculos = [],
}: {
  fatura: FaturaDTO;
  podeCancelar: boolean;
  preferencias?: PreferenciasCobrancaDTO;
  passosRegua?: { id: string; rotulo: string }[];
  podeEnviarRegua?: boolean;
  vinculos?: ClienteServicoDTO[];
}) {
  const [codigos, setCodigos] = useState(false);
  if (fatura.excluida) {
    return <p className="text-sm text-muted">Cancelada em {formatarDiaMes(fatura.atualizadoEm)}</p>;
  }

  const via = fatura.boletoUrl ?? fatura.faturaUrl;
  const temCodigo = Boolean(fatura.linhaDigitavel || fatura.pixCopiaCola);
  const recorrencia = recorrenciaAtivaDaFatura(fatura, vinculos);

  return (
    <details className="relative">
      <summary className={`${classeBotaoSecundario} list-none marker:hidden [&::-webkit-details-marker]:hidden`}>
        Ações
      </summary>
      <div className="mt-2 grid gap-3 rounded-2xl border border-line bg-paper p-3">
        {via ? (
          <a href={via} target="_blank" rel="noreferrer" className="text-sm font-medium text-canopy hover:underline">
            {fatura.formaCobranca === "CREDIT_CARD" ? "Página do cartão" : "Segunda via"}
          </a>
        ) : (
          <p className="text-sm text-muted">Sem link</p>
        )}
        <AcoesCompartilhar
          link={via}
          whatsapp={fatura.whatsapp}
          email={fatura.email}
          cliente={fatura.nomeCliente}
          servico={fatura.nomeServico ?? fatura.descricao ?? ""}
          valor={fatura.valor}
          vencimento={fatura.vencimento}
          modeloMensagem={preferencias.modeloMensagem}
          modeloAssunto={preferencias.modeloAssunto}
        />
        {temCodigo ? (
          <div>
            <button type="button" className="text-sm font-medium text-canopy hover:underline" onClick={() => setCodigos((atual) => !atual)}>
              {codigos ? "Ocultar código" : "Ver código"}
            </button>
            {codigos && fatura.linhaDigitavel ? (
              <p className="mt-2 break-all text-xs text-muted">{fatura.linhaDigitavel}</p>
            ) : null}
            {codigos && fatura.pixCopiaCola ? (
              <p className="mt-1 break-all text-xs text-muted">Pix: {fatura.pixCopiaCola}</p>
            ) : null}
          </div>
        ) : null}
        <AcoesLembrete
          faturaId={fatura.id}
          lembretes={fatura.lembretes ?? []}
          passos={passosRegua}
          podeEnviar={podeEnviarRegua && (fatura.status === "PENDING" || fatura.status === "OVERDUE")}
        />
        {podeCancelar ? <BotaoCancelarFatura id={fatura.id} recorrencia={recorrencia} /> : null}
      </div>
    </details>
  );
}
