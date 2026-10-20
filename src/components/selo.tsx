import { rotuloSegmento, rotuloStatusCliente, rotuloStatusFilial } from "@/lib/rotulos";
import type { Segmento, StatusCliente, StatusFilial } from "@/lib/tipos";

const cores: Record<string, string> = {
  ATIVO: "bg-leaf text-forest",
  ATIVA: "bg-leaf text-forest",
  INATIVO: "bg-clay-soft text-clay",
  INATIVA: "bg-clay-soft text-clay",
  EM_IMPLANTACAO: "bg-gold-soft text-gold",
};

export function Selo({
  valor,
  tipo,
}: {
  valor: string;
  tipo: "cliente" | "filial" | "segmento";
}) {
  const rotulo =
    tipo === "segmento"
      ? rotuloSegmento(valor as Segmento)
      : tipo === "filial"
        ? rotuloStatusFilial(valor as StatusFilial)
        : rotuloStatusCliente(valor as StatusCliente);
  const cor = tipo === "segmento" ? "bg-sand text-ink" : (cores[valor] ?? "bg-sand text-ink");

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cor}`}>
      {tipo === "segmento" ? null : <span className="size-1.5 rounded-full bg-current" />}
      {rotulo}
    </span>
  );
}
