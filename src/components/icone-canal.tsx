import { Mail } from "lucide-react";
import { nomeCanalMarcador, type CanalMarcador } from "@/lib/linha-tempo-regua";

function IconeWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.52 3.48A11.8 11.8 0 0 0 12.06 0C5.5 0 .16 5.33.16 11.89c0 2.1.55 4.14 1.59 5.95L0 24l6.3-1.65a11.9 11.9 0 0 0 5.75 1.47h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.43-8.44zM12.06 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.74.98 1-3.64-.22-.37a9.35 9.35 0 0 1-1.44-5.01c0-5.18 4.22-9.4 9.42-9.4 2.51 0 4.88.98 6.66 2.76a9.35 9.35 0 0 1 2.75 6.65c0 5.18-4.22 9.4-9.4 9.54zm5.16-7.05c-.28-.14-1.67-.82-1.93-.92-.26-.1-.45-.14-.64.14-.19.28-.73.92-.9 1.11-.16.19-.33.21-.61.07-.28-.14-1.18-.43-2.25-1.38-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.5.14-.16.19-.28.28-.47.1-.19.05-.35-.02-.5-.07-.14-.64-1.54-.88-2.11-.23-.55-.47-.48-.64-.49h-.55c-.19 0-.5.07-.76.35-.26.28-1 1-1 2.43s1.03 2.82 1.17 3.01c.14.19 2.03 3.1 4.92 4.35.69.3 1.22.47 1.64.6.69.22 1.32.19 1.81.11.55-.08 1.67-.68 1.9-1.34.24-.66.24-1.22.17-1.34-.07-.12-.26-.19-.54-.33z" />
    </svg>
  );
}

export function IconeCanal({ canal, className = "size-3.5" }: { canal: CanalMarcador; className?: string }) {
  const nome = nomeCanalMarcador(canal);
  return (
    <span role="img" title={nome} aria-label={nome} className="inline-flex shrink-0 items-center justify-center">
      {canal === "email" ? (
        <Mail className={className} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <IconeWhatsapp className={className} />
      )}
    </span>
  );
}
