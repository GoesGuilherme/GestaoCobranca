import { tomFatura, type TomFatura } from "@/lib/fatura-situacao";
import {
  rotuloSegmento,
  rotuloStatusCliente,
  rotuloStatusFatura,
  rotuloStatusFilial,
  rotuloStatusServicoCliente,
} from "@/lib/rotulos";
import type { Segmento, StatusCliente, StatusFilial, StatusServicoCliente } from "@/lib/tipos";

const cores: Record<string, string> = {
  ATIVO: "bg-leaf text-ok",
  ATIVA: "bg-leaf text-ok",
  INATIVO: "bg-clay-soft text-clay",
  INATIVA: "bg-clay-soft text-clay",
  EM_IMPLANTACAO: "bg-gold-soft text-gold-ink",
  BLOQUEADO: "bg-clay text-white",
};

const coresFatura: Record<TomFatura, string> = {
  aberto: "bg-gold-soft text-gold-ink ring-1 ring-gold/50",
  vencida: "bg-clay-soft text-clay ring-1 ring-clay/40",
  paga: "bg-leaf text-ok ring-1 ring-ok/30",
  cancelada: "bg-sand text-ink ring-1 ring-line",
  estorno: "bg-[#f8e6d4] text-[#9a3412] ring-1 ring-[#9a3412]/30",
};

export function Selo({
  valor,
  tipo,
}: {
  valor: string;
  tipo: "cliente" | "filial" | "segmento" | "servico";
}) {
  const rotulo =
    tipo === "segmento"
      ? rotuloSegmento(valor as Segmento)
      : tipo === "filial"
        ? rotuloStatusFilial(valor as StatusFilial)
        : tipo === "servico"
          ? rotuloStatusServicoCliente(valor as StatusServicoCliente)
          : rotuloStatusCliente(valor as StatusCliente);
  const cor = tipo === "segmento" ? "bg-sand text-ink" : (cores[valor] ?? "bg-sand text-ink");

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cor}`}>
      {tipo === "segmento" ? null : <span className="size-1.5 rounded-full bg-current" />}
      {rotulo}
    </span>
  );
}

export function SeloFatura({ status, excluida }: { status: string; excluida: boolean }) {
  const tom = tomFatura(status, excluida);
  const rotulo = rotuloStatusFatura(status, excluida);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${coresFatura[tom]}`}
      title={rotulo}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {rotulo}
    </span>
  );
}
