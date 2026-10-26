"use client";

import { useState } from "react";
import { MODELO_ASSUNTO_PADRAO, MODELO_MENSAGEM_PADRAO, linkEmail, linkWhatsapp, textoCobranca } from "@/lib/cobranca";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";

const classeCompartilhar =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-sand disabled:cursor-not-allowed disabled:opacity-50";

export function AcoesCompartilhar({
  link,
  whatsapp,
  email,
  cliente,
  servico,
  valor,
  vencimento,
  modeloMensagem,
  modeloAssunto,
}: {
  link: string | null;
  whatsapp: string;
  email: string;
  cliente: string;
  servico: string;
  valor: string;
  vencimento: string;
  modeloMensagem: string;
  modeloAssunto: string;
}) {
  const [copiado, setCopiado] = useState(false);
  if (!link) return null;

  const dados = {
    cliente,
    servico: servico || "serviço",
    valor: formatarReais(valor),
    vencimento: vencimento ? formatarDataIso(vencimento) : "",
    link,
  };
  const mensagem = textoCobranca(modeloMensagem, MODELO_MENSAGEM_PADRAO, dados);
  const assunto = textoCobranca(modeloAssunto, MODELO_ASSUNTO_PADRAO, dados);
  const whatsappUrl = linkWhatsapp(whatsapp, mensagem);
  const emailUrl = linkEmail(email, assunto, mensagem);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link ?? "");
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={classeCompartilhar} onClick={() => void copiar()}>
        {copiado ? "Link copiado" : "Copiar link"}
      </button>
      {whatsappUrl ? (
        <a className={classeCompartilhar} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          Enviar por WhatsApp
        </a>
      ) : (
        <button type="button" className={classeCompartilhar} disabled>
          Enviar por WhatsApp
        </button>
      )}
      {emailUrl ? (
        <a className={classeCompartilhar} href={emailUrl}>
          Enviar por e-mail
        </a>
      ) : (
        <button type="button" className={classeCompartilhar} disabled>
          Enviar por e-mail
        </button>
      )}
    </div>
  );
}
