"use client";

import Link from "next/link";
import { useState } from "react";
import { MENSAGEM_REDEFINICAO_ENVIADA } from "@/lib/redefinicao-senha";
import { enviarJson } from "@/lib/api-cliente";
import { esquemaEsqueciSenha, mensagemDoCampo, mensagensDoZod } from "@/lib/validacao";
import { Aviso } from "./aviso";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

export function FormularioEsqueciSenha() {
  const [email, setEmail] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaEsqueciSenha.safeParse({ email });
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }

    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson<{ mensagem: string }>("/api/auth/esqueci-senha", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    const texto = resposta.dados.mensagem || MENSAGEM_REDEFINICAO_ENVIADA;
    setMensagem(texto);
    avisarSucesso(texto);
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
      <h1 className="font-display text-4xl">Esqueci minha senha</h1>
      <p className="mt-2 text-sm text-muted">
        Informe o e-mail da sua conta. Se ele estiver cadastrado, enviamos um link para criar uma senha nova.
      </p>
      {mensagem ? (
        <div className="mt-5">
          <Aviso tom="ok" titulo={mensagem}>
            <p>Olhe a caixa de entrada e o spam. O link vale por tempo limitado.</p>
          </Aviso>
        </div>
      ) : null}
      {mensagem ? null : (
        <>
          <div className="mt-5">
            <Campo label="E-mail" htmlFor="email" erro={campos.email} obrigatorio>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                className={classeCampo}
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                onBlur={() =>
                  setCampos((atual) => ({ ...atual, email: mensagemDoCampo(esquemaEsqueciSenha.shape.email, email) }))
                }
              />
            </Campo>
          </div>
          <button type="submit" className={`${classeBotaoPrimario} mt-6 w-full`} disabled={enviando} aria-busy={enviando}>
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
