"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RedirecionarAncoraWhatsapp({ destino }: { destino: string | null }) {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash !== "#whatsapp") return;
    if (destino) {
      router.replace(destino);
      return;
    }
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", url);
  }, [destino, router]);
  return null;
}
