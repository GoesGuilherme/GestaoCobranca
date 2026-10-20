"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { esquemaLogin, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

function destinoSeguro(valor: string | null) {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//")) return "/";
  return valor;
}

export function FormularioLogin({ mostrarExemplo }: { mostrarExemplo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaLogin.safeParse({ email, senha });
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Informe e-mail e senha.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson("/api/auth/entrar", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    router.push(destinoSeguro(params.get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
      <h1 className="font-display text-4xl">Entrar</h1>
      <p className="mt-2 text-sm text-muted">Acesso reservado a quem administra os clientes.</p>
      {erro ? (
        <p className="mt-5 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="mt-5 space-y-4">
        <Campo label="E-mail" htmlFor="email" erro={campos.email}>
          <input
            id="email"
            type="email"
            autoComplete="username"
            className={classeCampo}
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </Campo>
        <Campo label="Senha" htmlFor="senha" erro={campos.senha}>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            className={classeCampo}
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />
        </Campo>
      </div>
      <button type="submit" className={`${classeBotaoPrimario} mt-6 w-full`} disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </button>
      {mostrarExemplo ? (
        <div className="mt-6 rounded-2xl bg-sand px-4 py-3 text-sm text-ink/80">
          <p className="font-medium">Acesso de exemplo, só neste ambiente</p>
          <p className="mt-1">marina@exemplo.test</p>
          <p>exemplo-1234</p>
        </div>
      ) : null}
    </form>
  );
}
