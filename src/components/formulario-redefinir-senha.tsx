"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { esquemaRedefinirSenha, mensagensDoZod } from "@/lib/validacao";
import { Aviso } from "./aviso";
import { Campo } from "./campo";
import { EntradaSenha } from "./entrada-senha";
import { classeBotaoPrimario } from "./estilos";

export function FormularioRedefinirSenha({ token }: { token: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!token) {
    return (
      <div className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
        <h1 className="font-display text-4xl">Nova senha</h1>
        <p className="mt-3 text-sm text-muted">Este endereço não tem um link válido. Peça outro.</p>
        <p className="mt-5 text-sm">
          <Link href="/esqueci-senha" className="font-medium text-canopy hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    );
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaRedefinirSenha.safeParse({ token, senha, confirmacao });
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise a senha.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson("/api/auth/redefinir-senha", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      return;
    }
    router.push("/login?senha=redefinida");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
      <h1 className="font-display text-4xl">Nova senha</h1>
      <p className="mt-2 text-sm text-muted">Escolha uma senha com pelo menos 8 caracteres.</p>
      {erro ? (
        <div className="mt-5">
          <Aviso tom="erro" titulo={erro} />
        </div>
      ) : null}
      <div className="mt-5 space-y-4">
        <Campo label="Nova senha" htmlFor="senha" erro={campos.senha} obrigatorio dica="Pelo menos 8 caracteres.">
          <EntradaSenha
            id="senha"
            autoComplete="new-password"
            value={senha}
            invalido={Boolean(campos.senha)}
            onChange={setSenha}
          />
        </Campo>
        <Campo label="Confirmar senha" htmlFor="confirmacao" erro={campos.confirmacao} obrigatorio>
          <EntradaSenha
            id="confirmacao"
            autoComplete="new-password"
            value={confirmacao}
            invalido={Boolean(campos.confirmacao)}
            onChange={setConfirmacao}
          />
        </Campo>
      </div>
      <button type="submit" className={`${classeBotaoPrimario} mt-6 w-full`} disabled={enviando} aria-busy={enviando}>
        {enviando ? "Salvando..." : "Salvar senha"}
      </button>
      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-canopy hover:underline">
          Voltar para entrar
        </Link>
      </p>
    </form>
  );
}
