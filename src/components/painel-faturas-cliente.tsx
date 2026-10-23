"use client";

import { useEffect, useState } from "react";
import type { ClienteServicoDTO, FaturaDTO } from "@/lib/tipos";
import { FormularioFatura } from "./formulario-fatura";
import { TabelaFaturas } from "./tabela-faturas";

function tituloEmissao(forma: string) {
  if (forma === "PIX") return "Pix emitido";
  if (forma === "UNDEFINED") return "Cobrança emitida";
  return "Boleto emitido";
}

export function PainelFaturasCliente({
  clienteId,
  vinculos,
  faturas,
  podeCancelar,
}: {
  clienteId: string;
  vinculos: ClienteServicoDTO[];
  faturas: FaturaDTO[];
  podeCancelar: boolean;
}) {
  const [emitida, setEmitida] = useState<FaturaDTO | null>(null);

  useEffect(() => {
    if (!emitida) return;
    document.getElementById(`fatura-${emitida.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [emitida, faturas]);

  const link = emitida ? (emitida.boletoUrl ?? emitida.faturaUrl) : null;

  return (
    <>
      <FormularioFatura clienteId={clienteId} vinculos={vinculos} onEmitida={setEmitida} />
      {emitida ? (
        <div role="status" className="mt-4 rounded-2xl border border-forest/20 bg-leaf px-4 py-3 text-sm text-forest">
          <p className="font-medium">{tituloEmissao(emitida.formaCobranca)}</p>
          <p className="mt-1">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="font-medium underline">
                {emitida.boletoUrl ? "Abrir boleto" : "Abrir cobrança"}
              </a>
            ) : (
              "O link ainda não voltou do Asaas."
            )}
          </p>
        </div>
      ) : null}
      <div className="mt-4">
        <TabelaFaturas faturas={faturas} podeCancelar={podeCancelar} mostrarCliente={false} destaqueId={emitida?.id} />
      </div>
    </>
  );
}
