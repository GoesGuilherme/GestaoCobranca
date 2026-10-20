"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { STATUS_FILIAL } from "@/lib/rotulos";
import type { FilialDTO } from "@/lib/tipos";
import { UFS } from "@/lib/ufs";
import { esquemaFilial, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

type Valores = {
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  uf: string;
  status: string;
  observacoes: string;
};

export function FormularioFilial({
  clienteId,
  filial,
  cidadeInicial,
  ufInicial,
  aoCancelar,
  aoSalvar,
}: {
  clienteId: string;
  filial?: FilialDTO;
  cidadeInicial?: string;
  ufInicial?: string;
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>({
    nome: filial?.nome ?? "",
    cnpj: filial?.cnpj ?? "",
    endereco: filial?.endereco ?? "",
    cidade: filial?.cidade ?? cidadeInicial ?? "",
    uf: filial?.uf ?? ufInicial ?? "SP",
    status: filial?.status ?? "ATIVA",
    observacoes: filial?.observacoes ?? "",
  });
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alterar(nome: keyof Valores, valor: string) {
    setValores((atual) => ({ ...atual, [nome]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaFilial.safeParse(valores);
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise os campos destacados.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson<{ filial: FilialDTO }>(
      filial ? `/api/filiais/${filial.id}` : `/api/clientes/${clienteId}/filiais`,
      filial ? "PATCH" : "POST",
      resultado.data,
    );
    setEnviando(false);

    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      setErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }

    aoSalvar();
    router.refresh();
  }

  return (
    <form onSubmit={enviar} noValidate className="rounded-2xl border border-line bg-paper p-4 md:p-5">
      <h3 className="font-display text-2xl">{filial ? "Editar filial" : "Nova filial"}</h3>
      <p className="mt-1 text-sm text-muted">O nome deve ser o mesmo que aparece no PDVLegal.</p>
      {erro ? (
        <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Campo label="Nome no PDVLegal" htmlFor="filial-nome" erro={campos.nome}>
          <input
            id="filial-nome"
            className={classeCampo}
            placeholder="PRAIA GRANDE FOODTRUCK"
            value={valores.nome}
            onChange={(evento) => alterar("nome", evento.target.value)}
          />
        </Campo>
        <Campo label="CNPJ" htmlFor="filial-cnpj" erro={campos.cnpj}>
          <input
            id="filial-cnpj"
            className={classeCampo}
            value={valores.cnpj}
            onChange={(evento) => alterar("cnpj", evento.target.value)}
          />
        </Campo>
        <div className="md:col-span-2">
          <Campo label="Endereço" htmlFor="filial-endereco" erro={campos.endereco}>
            <input
              id="filial-endereco"
              className={classeCampo}
              value={valores.endereco}
              onChange={(evento) => alterar("endereco", evento.target.value)}
            />
          </Campo>
        </div>
        <Campo label="Cidade" htmlFor="filial-cidade" erro={campos.cidade}>
          <input
            id="filial-cidade"
            className={classeCampo}
            value={valores.cidade}
            onChange={(evento) => alterar("cidade", evento.target.value)}
          />
        </Campo>
        <Campo label="UF" htmlFor="filial-uf" erro={campos.uf}>
          <select
            id="filial-uf"
            className={classeCampo}
            value={valores.uf}
            onChange={(evento) => alterar("uf", evento.target.value)}
          >
            {UFS.map(([sigla, nome]) => (
              <option key={sigla} value={sigla}>
                {sigla} — {nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Status" htmlFor="filial-status" erro={campos.status}>
          <select
            id="filial-status"
            className={classeCampo}
            value={valores.status}
            onChange={(evento) => alterar("status", evento.target.value)}
          >
            {STATUS_FILIAL.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <div className="md:col-span-2">
          <Campo label="Observações" htmlFor="filial-observacoes" erro={campos.observacoes}>
            <textarea
              id="filial-observacoes"
              className={`${classeCampo} min-h-20 resize-y`}
              value={valores.observacoes}
              onChange={(evento) => alterar("observacoes", evento.target.value)}
            />
          </Campo>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Salvando..." : filial ? "Salvar filial" : "Cadastrar filial"}
        </button>
        <button type="button" className={classeBotaoSecundario} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
