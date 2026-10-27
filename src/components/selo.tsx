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
  aberto: "bg-gold-soft text-gold-ink",
  vencida: "bg-clay-soft text-clay",
  paga: "bg-leaf text-ok",
  cancelada: "bg-sand text-muted",
  estorno: "bg-[#f8e6d4] text-[#9a3412]",
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
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${coresFatura[tom]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {rotuloStatusFatura(status, excluida)}
    </span>
  );
}
