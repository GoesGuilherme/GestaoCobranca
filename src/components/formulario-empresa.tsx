"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import type { EmpresaResumo } from "@/lib/tipos";
import { esquemaDadosEmpresa, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";

export function FormularioEmpresa({ empresa }: { empresa: EmpresaResumo }) {
  const router = useRouter();
  const [valores, setValores] = useState({
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    cnpj: empresa.cnpj,
    emailContato: empresa.emailContato,
    telefone: empresa.telefone,
  });
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alterar(campo: keyof typeof valores, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaDadosEmpresa.safeParse(valores);
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise os dados.");
      setOk("");
      return;
    }

    setEnviando(true);
    setErro("");
    setOk("");
    setCampos({});
    const resposta = await enviarJson("/api/empresa", "PATCH", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      setErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    setOk("Dados da empresa atualizados.");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
      {erro ? (
        <p className="rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      {ok ? <p className="rounded-2xl bg-canopy/10 px-4 py-3 text-sm text-forest">{ok}</p> : null}
      <Campo label="Razão social" htmlFor="razaoSocial" erro={campos.razaoSocial}>
        <input id="razaoSocial" className={classeCampo} value={valores.razaoSocial} onChange={(evento) => alterar("razaoSocial", evento.target.value)} />
      </Campo>
      <Campo label="Nome fantasia" htmlFor="nomeFantasia" erro={campos.nomeFantasia}>
        <input id="nomeFantasia" className={classeCampo} value={valores.nomeFantasia} onChange={(evento) => alterar("nomeFantasia", evento.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="CNPJ" htmlFor="cnpj" erro={campos.cnpj} dica="Troque o placeholder pelo CNPJ real.">
          <input id="cnpj" className={classeCampo} value={valores.cnpj} onChange={(evento) => alterar("cnpj", evento.target.value)} />
        </Campo>
        <Campo label="Telefone" htmlFor="telefone" erro={campos.telefone}>
          <input id="telefone" className={classeCampo} value={valores.telefone} onChange={(evento) => alterar("telefone", evento.target.value)} />
        </Campo>
      </div>
      <Campo label="E-mail de contato" htmlFor="emailContato" erro={campos.emailContato}>
        <input id="emailContato" type="email" className={classeCampo} value={valores.emailContato} onChange={(evento) => alterar("emailContato", evento.target.value)} />
      </Campo>
      <p className="text-sm text-muted">Plano atual: {empresa.plano}</p>
      <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar empresa"}
      </button>
    </form>
  );
}
