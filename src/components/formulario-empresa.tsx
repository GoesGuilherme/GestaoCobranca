"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { valoresAposSalvar } from "@/lib/apos-salvar";
import { enviarJson } from "@/lib/api-cliente";
import { aplicarConsulta, camposDaEmpresa, type CamposEmpresaCnpj } from "@/lib/consulta-cnpj";
import { mascararCnpjDigitando, mascararTelefoneDigitando } from "@/lib/mascaras";
import type { EmpresaResumo } from "@/lib/tipos";
import { esquemaDadosEmpresa, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";
import { StatusConsultaCnpj } from "./status-consulta-cnpj";
import { useConsultaCnpj } from "./use-consulta-cnpj";

export function FormularioEmpresa({ empresa }: { empresa: EmpresaResumo }) {
  const router = useRouter();
  const [valores, setValores] = useState({
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    cnpj: mascararCnpjDigitando(empresa.cnpj),
    emailContato: empresa.emailContato,
    telefone: mascararTelefoneDigitando(empresa.telefone),
  });
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const statusConsultaId = useId();
  const aplicadosConsulta = useRef<CamposEmpresaCnpj | null>(null);
  const consulta = useConsultaCnpj(
    valores.cnpj,
    (recebidos) => {
      setValores((atual) => {
        const resultado = aplicarConsulta(atual, aplicadosConsulta.current, camposDaEmpresa(recebidos));
        aplicadosConsulta.current = resultado.aplicados;
        return resultado.valores;
      });
    },
    () => router.push("/login"),
  );

  function alterar(campo: keyof typeof valores, valor: string) {
    setValores((atual) => ({ ...atual, [campo]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaDadosEmpresa.safeParse(valores);
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }

    setEnviando(true);
    setCampos({});
    const resposta = await enviarJson("/api/empresa", "PATCH", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    setValores((atual) => valoresAposSalvar("editar", atual, atual));
    avisarSucesso("Dados da empresa atualizados");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="max-w-2xl space-y-4 rounded-3xl border border-line bg-card p-6">
      <Campo label="Razão social" htmlFor="razaoSocial" erro={campos.razaoSocial}>
        <input id="razaoSocial" className={classeCampo} value={valores.razaoSocial} onChange={(evento) => alterar("razaoSocial", evento.target.value)} />
      </Campo>
      <Campo label="Nome fantasia" htmlFor="nomeFantasia" erro={campos.nomeFantasia}>
        <input id="nomeFantasia" className={classeCampo} value={valores.nomeFantasia} onChange={(evento) => alterar("nomeFantasia", evento.target.value)} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Campo
            label="CNPJ"
            htmlFor="cnpj"
            erro={consulta.estado.fase === "ocioso" ? campos.cnpj : undefined}
            dica={consulta.estado.fase === "ocioso" ? "Troque o placeholder pelo CNPJ real." : undefined}
          >
            <input
              id="cnpj"
              className={classeCampo}
              inputMode="text"
              autoComplete="off"
              value={valores.cnpj}
              aria-busy={consulta.estado.fase === "carregando"}
              aria-describedby={consulta.estado.fase === "ocioso" ? undefined : statusConsultaId}
              onChange={(evento) => {
                alterar("cnpj", mascararCnpjDigitando(evento.target.value));
                setCampos((atual) => (atual.cnpj ? { ...atual, cnpj: "" } : atual));
              }}
            />
          </Campo>
          <StatusConsultaCnpj id={statusConsultaId} estado={consulta.estado} />
        </div>
        <Campo label="Telefone" htmlFor="telefone" erro={campos.telefone}>
          <input id="telefone" className={classeCampo} inputMode="tel" autoComplete="tel" value={valores.telefone} onChange={(evento) => alterar("telefone", mascararTelefoneDigitando(evento.target.value))} />
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
