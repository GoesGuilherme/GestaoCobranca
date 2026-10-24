"use client";

import { useEffect, useState } from "react";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { AcoesCompartilhar } from "./acoes-compartilhar";
import { FormularioFatura } from "./formulario-fatura";
import { TabelaFaturas } from "./tabela-faturas";

function tituloEmissao(forma: string) {
  if (forma === "PIX") return "Pix emitido";
  if (forma === "CREDIT_CARD") return "Cobrança no cartão emitida";
  if (forma === "UNDEFINED") return "Cobrança emitida";
  return "Boleto emitido";
}

function textoDoLink(forma: string, boleto: boolean) {
  if (forma === "CREDIT_CARD") return "Abrir página para cadastrar o cartão";
  if (boleto) return "Abrir boleto";
  return "Abrir cobrança";
}

export function PainelFaturasCliente({
  clienteId,
  vinculos,
  faturas,
  podeCancelar,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
}: {
  clienteId: string;
  vinculos: ClienteServicoDTO[];
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  preferencias?: PreferenciasCobrancaDTO;
}) {
  const [emitida, setEmitida] = useState<FaturaDTO | null>(null);

  useEffect(() => {
    if (!emitida) return;
    document.getElementById(`fatura-${emitida.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [emitida, faturas]);

  const link = emitida ? (emitida.boletoUrl ?? emitida.faturaUrl) : null;

  return (
    <>
      <FormularioFatura clienteId={clienteId} vinculos={vinculos} onEmitida={setEmitida} preferencias={preferencias} />
      {emitida ? (
        <div role="status" className="mt-4 rounded-2xl border border-forest/20 bg-leaf px-4 py-3 text-sm text-forest">
          <p className="font-medium">{tituloEmissao(emitida.formaCobranca)}</p>
          <p className="mt-1">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="font-medium underline">
                {textoDoLink(emitida.formaCobranca, Boolean(emitida.boletoUrl))}
              </a>
            ) : (
              "O link ainda não voltou do Asaas."
            )}
          </p>
          <div className="mt-3">
            <AcoesCompartilhar
              link={link}
              whatsapp={emitida.whatsapp}
              email={emitida.email}
              cliente={emitida.nomeCliente}
              servico={emitida.nomeServico ?? ""}
              valor={emitida.valor}
              vencimento={emitida.vencimento}
              modeloMensagem={preferencias.modeloMensagem}
              modeloAssunto={preferencias.modeloAssunto}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <TabelaFaturas
          faturas={faturas}
          podeCancelar={podeCancelar}
          mostrarCliente={false}
          destaqueId={emitida?.id}
          preferencias={preferencias}
        />
      </div>
    </>
  );
}
