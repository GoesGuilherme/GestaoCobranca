"use client";

import { useState } from "react";
import { formatarReais } from "@/lib/dinheiro";
import type { ComprovanteDTO } from "@/server/services/comprovante-service";
import { DialogoComprovante } from "./dialogo-comprovante";

export function PainelComprovantes({ comprovantes }: { comprovantes: ComprovanteDTO[] }) {
  const [aberto, setAberto] = useState<ComprovanteDTO | null>(null);
  if (comprovantes.length === 0) return null;
  return (
    <section className="mb-8 rounded-3xl border border-gold/40 bg-gold-soft p-4">
      <h2 className="font-display text-xl text-gold-ink">Comprovantes aguardando conferência</h2>
      <p className="mt-1 text-sm text-gold-ink">Confira se o dinheiro entrou antes de confirmar a baixa.</p>
      <ul className="mt-3 grid gap-2">
        {comprovantes.map((item) => (
          <li key={item.id}>
            <button type="button" className="w-full rounded-2xl bg-white px-3 py-2 text-left text-sm hover:bg-sand" onClick={() => setAberto(item)}>
              <span className="font-medium">{item.nomeCliente ?? "Cliente não identificado"}</span>
              <span className="text-muted">
                {" "}
                · {item.valorExtraido ? formatarReais(item.valorExtraido) : "valor não lido"}
                {item.alertas.length > 0 ? ` · ${item.alertas.length} alerta${item.alertas.length > 1 ? "s" : ""}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {aberto ? <DialogoComprovante comprovante={aberto} aberto onFechar={() => setAberto(null)} /> : null}
    </section>
  );
}
