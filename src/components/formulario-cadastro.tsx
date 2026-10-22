"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { esquemaCadastroEmpresa, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

const vazio = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  emailContato: "",
  telefone: "",
  nome: "",
  email: "",
  senha: "",
};

export function FormularioCadastro() {
  const router = useRouter();
  const [valores, setValores] = useState(vazio);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alterar(campo: keyof typeof vazio, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaCadastroEmpresa.safeParse(valores);
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise os dados da empresa.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson("/api/cadastro", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    router.push("/login?cadastrado=1");
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
      <h1 className="font-display text-4xl">Cadastrar empresa</h1>
      <p className="mt-2 text-sm text-muted">
        A primeira pessoa vira dona da conta e pode cadastrar o restante da equipe depois.
      </p>
      {erro ? (
        <p className="mt-5 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="mt-5 space-y-4">
        <Campo label="Razão social" htmlFor="razaoSocial" erro={campos.razaoSocial}>
          <input id="razaoSocial" className={classeCampo} value={valores.razaoSocial} onChange={(evento) => alterar("razaoSocial", evento.target.value)} />
        </Campo>
        <Campo label="Nome fantasia" htmlFor="nomeFantasia" erro={campos.nomeFantasia}>
          <input id="nomeFantasia" className={classeCampo} value={valores.nomeFantasia} onChange={(evento) => alterar("nomeFantasia", evento.target.value)} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CNPJ" htmlFor="cnpj" erro={campos.cnpj}>
            <input id="cnpj" className={classeCampo} value={valores.cnpj} onChange={(evento) => alterar("cnpj", evento.target.value)} />
          </Campo>
          <Campo label="Telefone" htmlFor="telefone" erro={campos.telefone}>
            <input id="telefone" className={classeCampo} value={valores.telefone} onChange={(evento) => alterar("telefone", evento.target.value)} />
          </Campo>
        </div>
        <Campo label="E-mail de contato" htmlFor="emailContato" erro={campos.emailContato}>
          <input id="emailContato" type="email" className={classeCampo} value={valores.emailContato} onChange={(evento) => alterar("emailContato", evento.target.value)} />
        </Campo>
        <Campo label="Seu nome" htmlFor="nome" erro={campos.nome}>
          <input id="nome" className={classeCampo} value={valores.nome} onChange={(evento) => alterar("nome", evento.target.value)} />
        </Campo>
        <Campo label="Seu e-mail de acesso" htmlFor="email" erro={campos.email}>
          <input id="email" type="email" autoComplete="username" className={classeCampo} value={valores.email} onChange={(evento) => alterar("email", evento.target.value)} />
        </Campo>
        <Campo label="Senha" htmlFor="senha" erro={campos.senha} dica="No mínimo 8 caracteres.">
          <input id="senha" type="password" autoComplete="new-password" className={classeCampo} value={valores.senha} onChange={(evento) => alterar("senha", evento.target.value)} />
        </Campo>
      </div>
      <button type="submit" className={`${classeBotaoPrimario} mt-6 w-full`} disabled={enviando}>
        {enviando ? "Criando..." : "Criar conta"}
      </button>
      <p className="mt-5 text-center text-sm text-muted">
        Já tem acesso?{" "}
        <Link href="/login" className="font-medium text-canopy hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
