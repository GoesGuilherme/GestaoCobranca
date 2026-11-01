"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { esquemaLogin, mensagemDoCampo, mensagensDoZod } from "@/lib/validacao";
import { Aviso } from "./aviso";
import { Campo, classeCampo } from "./campo";
import { EntradaSenha } from "./entrada-senha";
import { classeBotaoPrimario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro } from "./notificador";

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
  const [enviando, setEnviando] = useState(false);
  const suspensa = params.get("motivo") === "suspensa";

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaLogin.safeParse({ email, senha });
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }

    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson("/api/auth/entrar", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    router.push(destinoSeguro(params.get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
      <h1 className="font-display text-4xl">Entrar</h1>
      <p className="mt-2 text-sm text-muted">Entre com o acesso da sua empresa.</p>
      {suspensa ? (
        <div className="mt-5">
          <Aviso tom="erro" titulo="Esta empresa está suspensa. O acesso volta quando a plataforma reativar a conta." />
        </div>
      ) : null}
      <div className="mt-5 space-y-4">
        <Campo label="E-mail" htmlFor="email" erro={campos.email} obrigatorio>
          <input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            className={classeCampo}
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            onBlur={() => setCampos((atual) => ({ ...atual, email: mensagemDoCampo(esquemaLogin.shape.email, email) }))}
          />
        </Campo>
        <Campo label="Senha" htmlFor="senha" erro={campos.senha} obrigatorio>
          <EntradaSenha
            id="senha"
            autoComplete="current-password"
            value={senha}
            invalido={Boolean(campos.senha)}
            onChange={setSenha}
            onBlur={() => setCampos((atual) => ({ ...atual, senha: mensagemDoCampo(esquemaLogin.shape.senha, senha) }))}
          />
        </Campo>
      </div>
      <p className="mt-3 text-right text-sm">
        <Link href="/esqueci-senha" className="font-medium text-canopy hover:underline">
          Esqueci minha senha
        </Link>
      </p>
      <button type="submit" className={`${classeBotaoPrimario} mt-6 w-full`} disabled={enviando} aria-busy={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </button>
      <p className="mt-5 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-canopy hover:underline">
          Cadastrar minha empresa
        </Link>
      </p>
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
