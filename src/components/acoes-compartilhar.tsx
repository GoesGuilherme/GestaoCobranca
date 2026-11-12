"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import {
  lerMensagemDownload,
  MENSAGEM_DOWNLOAD_FALHOU,
  type DocumentoFatura,
} from "@/lib/baixar-fatura";
import { MODELO_ASSUNTO_PADRAO, MODELO_MENSAGEM_PADRAO, linkEmail, linkWhatsapp, textoCobranca } from "@/lib/cobranca";
import { formatarReais } from "@/lib/dinheiro";
import { formatarDataIso } from "@/lib/formatacao";

type CanalServidor = "EMAIL" | "WHATSAPP";

type EnvioCartao = { faturaId: string } | { clienteServicoId: string };

type RetornoCanal = { texto: string; ok: boolean };

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
  baixar,
  envioCartao,
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
  baixar?: DocumentoFatura;
  envioCartao?: EnvioCartao;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [falhaDownload, setFalhaDownload] = useState<string | null>(null);
  const [canalAtivo, setCanalAtivo] = useState<CanalServidor | null>(null);
  const [retornos, setRetornos] = useState<Partial<Record<CanalServidor, RetornoCanal>>>({});
  const ocupado = useRef(false);
  const avisoId = useId();
  const linkUtil = link?.trim() ?? "";
  if (!linkUtil && !baixar) return null;

  const dados = {
    cliente,
    servico: servico || "serviço",
    valor: formatarReais(valor),
    vencimento: vencimento ? formatarDataIso(vencimento) : "",
    link: linkUtil,
  };
  const mensagem = linkUtil ? textoCobranca(modeloMensagem, MODELO_MENSAGEM_PADRAO, dados) : "";
  const assunto = linkUtil ? textoCobranca(modeloAssunto, MODELO_ASSUNTO_PADRAO, dados) : "";
  const whatsappUrl = envioCartao || !linkUtil ? null : linkWhatsapp(whatsapp, mensagem);
  const emailUrl = envioCartao || !linkUtil ? null : linkEmail(email, assunto, mensagem);
  const aviso = baixar && !baixar.disponivel ? baixar.mensagem : falhaDownload;

  function urlDoEnvio() {
    if (!envioCartao) return "";
    if ("faturaId" in envioCartao) return `/api/faturas/${envioCartao.faturaId}/link-cartao`;
    return `/api/servicos-cliente/${envioCartao.clienteServicoId}/link-cartao`;
  }

  async function enviarPeloServidor(canal: CanalServidor) {
    if (!envioCartao || ocupado.current || retornos[canal]?.ok) return;
    ocupado.current = true;
    setCanalAtivo(canal);
    try {
      const resposta = await enviarJson<{ envio: { mensagem: string; resultado: string } }>(urlDoEnvio(), "POST", { canal });
      if (!resposta.ok) {
        if (resposta.status === 401) {
          router.push("/login");
          return;
        }
        setRetornos((atual) => ({ ...atual, [canal]: { texto: resposta.erro, ok: false } }));
        return;
      }
      const ok = resposta.dados.envio.resultado === "aceito";
      setRetornos((atual) => ({ ...atual, [canal]: { texto: resposta.dados.envio.mensagem, ok } }));
      if (ok) router.refresh();
    } finally {
      ocupado.current = false;
      setCanalAtivo(null);
    }
  }

  function textoBotao(canal: CanalServidor, ocioso: string) {
    if (canalAtivo === canal) return "Enviando…";
    if (retornos[canal]?.ok) return canal === "EMAIL" ? "E-mail enviado" : "WhatsApp enviado";
    return ocioso;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linkUtil);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  async function baixarDaAplicacao() {
    if (!baixar?.disponivel || baixar.origem !== "aplicacao" || baixando) return;
    setBaixando(true);
    setFalhaDownload(null);
    try {
      const resposta = await fetch(baixar.href, { credentials: "same-origin" });
      const falha = await lerMensagemDownload(resposta);
      if (falha) {
        setFalhaDownload(falha);
        return;
      }
      const blob = await resposta.blob();
      if (blob.size === 0) {
        setFalhaDownload(MENSAGEM_DOWNLOAD_FALHOU);
        return;
      }
      const url = URL.createObjectURL(blob);
      const ancora = document.createElement("a");
      ancora.href = url;
      ancora.download = baixar.nomeArquivo;
      document.body.appendChild(ancora);
      ancora.click();
      ancora.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFalhaDownload(MENSAGEM_DOWNLOAD_FALHOU);
    } finally {
      setBaixando(false);
    }
  }

  let acaoPrincipal;
  if (!baixar) {
    acaoPrincipal = (
      <button type="button" className={classeCompartilhar} onClick={() => void copiar()}>
        {copiado ? "Link copiado" : "Copiar link"}
      </button>
    );
  } else if (!baixar.disponivel) {
    acaoPrincipal = (
      <button type="button" className={classeCompartilhar} disabled aria-describedby={avisoId}>
        Baixar fatura
      </button>
    );
  } else if (baixar.origem === "provedor") {
    acaoPrincipal = (
      <a
        className={classeCompartilhar}
        href={baixar.href}
        download={baixar.nomeArquivo}
        target="_blank"
        rel="noopener noreferrer"
      >
        Baixar fatura
      </a>
    );
  } else {
    acaoPrincipal = (
      <button
        type="button"
        className={classeCompartilhar}
        disabled={baixando}
        aria-describedby={falhaDownload ? avisoId : undefined}
        onClick={() => void baixarDaAplicacao()}
      >
        {baixando ? "Baixando…" : "Baixar fatura"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {acaoPrincipal}
      {envioCartao ? (
        <button
          type="button"
          className={classeCompartilhar}
          disabled={canalAtivo !== null || retornos.WHATSAPP?.ok === true}
          aria-busy={canalAtivo === "WHATSAPP"}
          onClick={() => void enviarPeloServidor("WHATSAPP")}
        >
          {textoBotao("WHATSAPP", "Enviar por WhatsApp")}
        </button>
      ) : whatsappUrl ? (
        <a className={classeCompartilhar} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          Enviar por WhatsApp
        </a>
      ) : (
        <button type="button" className={classeCompartilhar} disabled>
          Enviar por WhatsApp
        </button>
      )}
      {envioCartao ? (
        <button
          type="button"
          className={classeCompartilhar}
          disabled={canalAtivo !== null || retornos.EMAIL?.ok === true}
          aria-busy={canalAtivo === "EMAIL"}
          onClick={() => void enviarPeloServidor("EMAIL")}
        >
          {textoBotao("EMAIL", "Enviar por e-mail")}
        </button>
      ) : emailUrl ? (
        <a className={classeCompartilhar} href={emailUrl}>
          Enviar por e-mail
        </a>
      ) : (
        <button type="button" className={classeCompartilhar} disabled>
          Enviar por e-mail
        </button>
      )}
      {retornos.WHATSAPP ? (
        <p role="status" className={`basis-full text-sm ${retornos.WHATSAPP.ok ? "font-medium text-ink" : "text-clay"}`}>
          {retornos.WHATSAPP.texto}
        </p>
      ) : null}
      {retornos.EMAIL ? (
        <p role="status" className={`basis-full text-sm ${retornos.EMAIL.ok ? "font-medium text-ink" : "text-clay"}`}>
          {retornos.EMAIL.texto}
        </p>
      ) : null}
      {aviso ? (
        <p id={avisoId} role="status" className="basis-full text-sm text-muted">
          {aviso}
        </p>
      ) : null}
    </div>
  );
}
