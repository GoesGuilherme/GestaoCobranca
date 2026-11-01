"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPRESA_ADMIN_VAZIA, valoresAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import { mascararCnpjDigitando, mascararTelefoneDigitando } from "@/lib/mascaras";
import { esquemaCadastroAdmin, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

const vazio = EMPRESA_ADMIN_VAZIA;

export function FormularioEmpresaAdmin() {
  const router = useRouter();
  const [valores, setValores] = useState(vazio);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function alterar(campo: keyof typeof vazio, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaCadastroAdmin.safeParse({
      ...valores,
      plano: valores.plano.trim() || undefined,
    });
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }

    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson("/api/admin/empresas", "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    setValores((atual) => valoresAposSalvar("criar", atual, vazio));
    avisarSucesso("Empresa cadastrada");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-3xl border border-line bg-card p-6">
      <h2 className="font-display text-2xl">Nova empresa</h2>
      <p className="mt-1 text-sm text-muted">Cria a assinante e o primeiro usuário, já como dono.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Campo label="Razão social" htmlFor="admin-razao" erro={campos.razaoSocial}>
          <input id="admin-razao" className={classeCampo} value={valores.razaoSocial} onChange={(evento) => alterar("razaoSocial", evento.target.value)} />
        </Campo>
        <Campo label="Nome fantasia" htmlFor="admin-fantasia" erro={campos.nomeFantasia}>
          <input id="admin-fantasia" className={classeCampo} value={valores.nomeFantasia} onChange={(evento) => alterar("nomeFantasia", evento.target.value)} />
        </Campo>
        <Campo label="CNPJ" htmlFor="admin-cnpj" erro={campos.cnpj}>
          <input id="admin-cnpj" className={classeCampo} inputMode="text" autoComplete="off" value={valores.cnpj} onChange={(evento) => alterar("cnpj", mascararCnpjDigitando(evento.target.value))} />
        </Campo>
        <Campo label="Telefone" htmlFor="admin-telefone" erro={campos.telefone}>
          <input id="admin-telefone" className={classeCampo} inputMode="tel" autoComplete="tel" value={valores.telefone} onChange={(evento) => alterar("telefone", mascararTelefoneDigitando(evento.target.value))} />
        </Campo>
        <Campo label="E-mail de contato" htmlFor="admin-contato" erro={campos.emailContato}>
          <input id="admin-contato" type="email" className={classeCampo} value={valores.emailContato} onChange={(evento) => alterar("emailContato", evento.target.value)} />
        </Campo>
        <Campo label="Plano" htmlFor="admin-plano" erro={campos.plano}>
          <input id="admin-plano" className={classeCampo} value={valores.plano} onChange={(evento) => alterar("plano", evento.target.value)} />
        </Campo>
        <Campo label="Nome do dono" htmlFor="admin-nome" erro={campos.nome}>
          <input id="admin-nome" className={classeCampo} value={valores.nome} onChange={(evento) => alterar("nome", evento.target.value)} />
        </Campo>
        <Campo label="E-mail do dono" htmlFor="admin-email" erro={campos.email}>
          <input id="admin-email" type="email" className={classeCampo} value={valores.email} onChange={(evento) => alterar("email", evento.target.value)} />
        </Campo>
        <Campo label="Senha do dono" htmlFor="admin-senha" erro={campos.senha}>
          <input id="admin-senha" type="password" className={classeCampo} value={valores.senha} onChange={(evento) => alterar("senha", evento.target.value)} />
        </Campo>
      </div>
      <button type="submit" className={`${classeBotaoPrimario} mt-4`} disabled={enviando}>
        {enviando ? "Salvando..." : "Cadastrar empresa"}
      </button>
    </form>
  );
}
