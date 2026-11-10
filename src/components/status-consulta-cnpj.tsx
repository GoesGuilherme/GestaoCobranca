import { TEXTO_CONSULTANDO_CNPJ, type EstadoConsultaCnpj } from "@/lib/consulta-cnpj";

export function StatusConsultaCnpj({ id, estado }: { id: string; estado: EstadoConsultaCnpj }) {
  if (estado.fase === "ocioso") return null;
  const erro = estado.fase === "erro";
  return (
    <p
      id={id}
      role={erro ? "alert" : "status"}
      aria-live="polite"
      className={erro ? "mt-1 text-xs text-clay" : "mt-1 text-xs text-muted"}
    >
      {estado.fase === "carregando" ? TEXTO_CONSULTANDO_CNPJ : estado.texto}
    </p>
  );
}
