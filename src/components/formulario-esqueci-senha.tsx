"use client";

import Link from "next/link";
import { useState } from "react";
import { MENSAGEM_REDEFINICAO_ENVIADA } from "@/lib/redefinicao-senha";
import { enviarJson } from "@/lib/api-cliente";
import { esquemaEsqueciSenha, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

export function FormularioEsqueciSenha() {
  const [email, setEmail] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaEsqueciSenha.safeParse({ email });
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Informe o e-mail.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson<{ mensagem: string }>("/api/auth/esqueci-senha", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    setMensagem(resposta.dados.mensagem || MENSAGEM_REDEFINICAO_ENVIADA);
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
      <h1 className="font-display text-4xl">Esqueci minha senha</h1>
      <p className="mt-2 text-sm text-muted">
        Informe o e-mail da sua conta. Se ele estiver cadastrado, enviamos um link para criar uma senha nova.
      </p>
      {mensagem ? (
        <p className="mt-5 rounded-2xl bg-leaf px-4 py-3 text-sm text-ok" role="status">
          {mensagem}
        </p>
      ) : null}
      {erro ? (
        <p className="mt-5 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      {mensagem ? null : (
        <>
          <div className="mt-5">
            <Campo label="E-mail" htmlFor="email" erro={campos.email}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className={classeCampo}
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
              />
            </Campo>
          </div>
          <button type="submit" className={`${classeBotaoPrimario} mt-6 w-full`} disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar link"}
          </button>
        </>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-canopy hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </form>
  );
}
