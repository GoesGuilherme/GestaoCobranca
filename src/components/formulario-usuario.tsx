"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { PAPEIS } from "@/lib/rotulos";
import type { PapelUsuario } from "@/lib/tipos";
import { esquemaNovoUsuario, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

export function FormularioUsuario() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState<PapelUsuario>("SUPORTE");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaNovoUsuario.safeParse({ nome, email, senha, papel });
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise o cadastro.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson("/api/usuarios", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    setNome("");
    setEmail("");
    setSenha("");
    setPapel("SUPORTE");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Novo acesso</h2>
      <p className="mt-1 text-sm text-muted">
        A pessoa entra com este e-mail e esta senha. O acesso vale só para esta empresa.
      </p>
      {erro ? (
        <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Campo label="Nome" htmlFor="nome" erro={campos.nome}>
          <input id="nome" className={classeCampo} value={nome} onChange={(evento) => setNome(evento.target.value)} />
        </Campo>
        <Campo label="E-mail" htmlFor="email" erro={campos.email}>
          <input id="email" type="email" className={classeCampo} value={email} onChange={(evento) => setEmail(evento.target.value)} />
        </Campo>
        <Campo label="Senha" htmlFor="senha" erro={campos.senha} dica="No mínimo 8 caracteres.">
          <input id="senha" type="password" className={classeCampo} value={senha} onChange={(evento) => setSenha(evento.target.value)} />
        </Campo>
        <Campo label="Papel" htmlFor="papel" erro={campos.papel}>
          <select id="papel" className={classeCampo} value={papel} onChange={(evento) => setPapel(evento.target.value as PapelUsuario)}>
            {PAPEIS.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <button type="submit" className={`${classeBotaoPrimario} mt-4`} disabled={enviando}>
        {enviando ? "Salvando..." : "Cadastrar usuário"}
      </button>
    </form>
  );
}
