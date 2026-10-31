"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import {
  calcularMargem,
  formatarAliquotaCampo,
  formatarReaisAssinado,
  formatarValorCampo,
  normalizarAliquota,
  normalizarDinheiro,
} from "@/lib/dinheiro";
import { mascararMoedaDigitando } from "@/lib/mascaras";
import type { ServicoDTO } from "@/lib/tipos";
import { esquemaServico, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

type Valores = {
  nome: string;
  descricao: string;
  precoPadrao: string;
  custo: string;
  aliquotaImposto: string;
  ativo: string;
};

export function FormularioServico({
  servico,
  aoCancelar,
  aoSalvar,
}: {
  servico?: ServicoDTO;
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>({
    nome: servico?.nome ?? "",
    descricao: servico?.descricao ?? "",
    precoPadrao: servico ? formatarValorCampo(servico.precoPadrao) : "",
    custo: servico?.custo ? formatarValorCampo(servico.custo) : "",
    aliquotaImposto: servico?.aliquotaImposto ? formatarAliquotaCampo(servico.aliquotaImposto) : "",
    ativo: servico ? String(servico.ativo) : "true",
  });
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alterar(nome: keyof Valores, valor: string) {
    setValores((atual) => ({ ...atual, [nome]: valor }));
  }

  const preco = normalizarDinheiro(valores.precoPadrao);
  const custo = valores.custo.trim() ? normalizarDinheiro(valores.custo) : null;
  const aliquota = valores.aliquotaImposto.trim() ? normalizarAliquota(valores.aliquotaImposto) : null;
  const custoInvalido = Boolean(valores.custo.trim()) && custo === null;
  const aliquotaInvalida = Boolean(valores.aliquotaImposto.trim()) && aliquota === null;
  const margem =
    preco && !custoInvalido && !aliquotaInvalida ? calcularMargem(preco, custo, aliquota) : null;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaServico.safeParse(valores);
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise os campos destacados.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson<{ servico: ServicoDTO }>(
      servico ? `/api/servicos/${servico.id}` : "/api/servicos",
      servico ? "PATCH" : "POST",
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
      <h3 className="font-display text-2xl">{servico ? "Editar serviço" : "Novo serviço"}</h3>
      <p className="mt-1 text-sm text-muted">
        O preço padrão e o custo padrão só sugerem os valores na hora de vincular um cliente. O combinado e o custo da venda ficam no cliente.
      </p>
      {erro ? (
        <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Campo label="Nome" htmlFor="servico-nome" erro={campos.nome}>
          <input
            id="servico-nome"
            className={classeCampo}
            placeholder="Nome do serviço"
            value={valores.nome}
            onChange={(evento) => alterar("nome", evento.target.value)}
          />
        </Campo>
        <Campo label="Preço padrão" htmlFor="servico-preco" erro={campos.precoPadrao} dica="Exemplo: 189,90">
          <input
            id="servico-preco"
            inputMode="decimal"
            className={classeCampo}
            placeholder="189,90"
            value={valores.precoPadrao}
            onChange={(evento) => alterar("precoPadrao", mascararMoedaDigitando(evento.target.value))}
          />
        </Campo>
        <Campo
          label="Custo padrão"
          htmlFor="servico-custo"
          erro={campos.custo}
          dica="Opcional. Sugestão ao vender. O custo de cada cliente fica no vínculo."
        >
          <input
            id="servico-custo"
            inputMode="decimal"
            className={classeCampo}
            placeholder="40,00"
            value={valores.custo}
            onChange={(evento) => alterar("custo", mascararMoedaDigitando(evento.target.value))}
          />
        </Campo>
        <Campo
          label="Impostos"
          htmlFor="servico-aliquota"
          erro={campos.aliquotaImposto}
          dica="Opcional. Alíquota sobre o preço cobrado. Exemplo: 5 para 5%."
        >
          <input
            id="servico-aliquota"
            inputMode="decimal"
            className={classeCampo}
            placeholder="5"
            value={valores.aliquotaImposto}
            onChange={(evento) => alterar("aliquotaImposto", evento.target.value)}
          />
        </Campo>
        {margem ? (
          <p className="text-sm tabular-nums text-muted md:col-span-2">
            Margem no preço padrão: {formatarReaisAssinado(margem)}. No cliente, a margem usa o custo do vínculo e a alíquota sobre o valor combinado.
          </p>
        ) : null}
        <Campo label="No catálogo" htmlFor="servico-ativo" erro={campos.ativo}>
          <select
            id="servico-ativo"
            className={classeCampo}
            value={valores.ativo}
            onChange={(evento) => alterar("ativo", evento.target.value)}
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </Campo>
        <div className="md:col-span-2">
          <Campo label="Descrição" htmlFor="servico-descricao" erro={campos.descricao}>
            <textarea
              id="servico-descricao"
              className={`${classeCampo} min-h-20 resize-y`}
              value={valores.descricao}
              onChange={(evento) => alterar("descricao", evento.target.value)}
            />
          </Campo>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
          {enviando ? "Salvando..." : servico ? "Salvar serviço" : "Cadastrar serviço"}
        </button>
        <button type="button" className={classeBotaoSecundario} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
