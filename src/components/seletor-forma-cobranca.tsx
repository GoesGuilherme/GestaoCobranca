"use client";

import type { OpcaoCobranca } from "@/lib/formas-cobranca";
import { classeCampo } from "./campo";

export function SeletorFormaCobranca({
  id,
  valor,
  opcoes,
  onChange,
}: {
  id: string;
  valor: string;
  opcoes: OpcaoCobranca[];
  onChange: (idOpcao: string) => void;
}) {
  return (
    <select id={id} className={classeCampo} value={valor} onChange={(evento) => onChange(evento.target.value)}>
      {opcoes.length === 0 ? <option value="">Nenhuma forma disponível</option> : null}
      {opcoes.map((opcao) => (
        <option key={opcao.id} value={opcao.id}>
          {opcao.rotulo}
        </option>
      ))}
    </select>
  );
}
