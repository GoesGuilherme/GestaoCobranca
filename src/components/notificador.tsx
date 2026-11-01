"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import {
  COOKIE_TOAST,
  DURACAO_ERRO_MS,
  DURACAO_SUCESSO_MS,
  TEXTO_CAMPOS_OBRIGATORIOS,
  lerFlashDoCabecalho,
  mensagemErroVisivel,
  serializarFlash,
  type TipoToast,
} from "@/lib/notificacao";

function gravarFlash(tipo: TipoToast, mensagem: string) {
  const valor = serializarFlash({ tipo, mensagem });
  document.cookie = `${COOKIE_TOAST}=${valor}; Path=/; Max-Age=30; SameSite=Lax`;
}

function consumirFlash() {
  const flash = lerFlashDoCabecalho(document.cookie);
  if (!document.cookie.split(";").some((item) => item.trim().startsWith(`${COOKIE_TOAST}=`))) return null;
  document.cookie = `${COOKIE_TOAST}=; Path=/; Max-Age=0; SameSite=Lax`;
  return flash;
}

function mostrar(tipo: TipoToast, mensagem: string) {
  if (tipo === "sucesso") toast.success(mensagem, { duration: DURACAO_SUCESSO_MS });
  else toast.error(mensagem, { duration: DURACAO_ERRO_MS });
}

export function avisarSucesso(mensagem: string, opcoes?: { aposNavegar?: boolean }) {
  if (opcoes?.aposNavegar) {
    gravarFlash("sucesso", mensagem);
    return;
  }
  mostrar("sucesso", mensagem);
}

export function avisarErro(mensagem?: string | null, opcoes?: { aposNavegar?: boolean }) {
  const texto = mensagemErroVisivel(mensagem);
  if (opcoes?.aposNavegar) {
    gravarFlash("erro", texto);
    return;
  }
  mostrar("erro", texto);
}

export function avisarCamposObrigatorios() {
  mostrar("erro", TEXTO_CAMPOS_OBRIGATORIOS);
  window.setTimeout(() => {
    document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, 0);
}

export function Notificador() {
  const caminho = usePathname();

  useEffect(() => {
    const flash = consumirFlash();
    if (!flash) return;
    mostrar(flash.tipo, flash.mensagem);
  }, [caminho]);

  return (
    <Toaster
      position="top-right"
      theme="light"
      closeButton
      duration={DURACAO_SUCESSO_MS}
      visibleToasts={4}
      offset={{ top: 16, right: 16 }}
      mobileOffset={{ top: 12, right: 12, left: 12 }}
      customAriaLabel="Notificações"
      toastOptions={{ closeButtonAriaLabel: "Fechar notificação" }}
      style={{ "--width": "min(22rem, calc(100vw - 1.5rem))" } as React.CSSProperties}
    />
  );
}
