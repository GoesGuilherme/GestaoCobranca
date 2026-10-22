"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { dataHojeIso } from "@/lib/data";
import { formatarValorCampo } from "@/lib/dinheiro";
import { RECORRENCIAS, STATUS_SERVICO_CLIENTE } from "@/lib/rotulos";
import type { ClienteServicoDTO, ServicoDTO } from "@/lib/tipos";
import { esquemaClienteServico, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";

type Valores = {
  servicoId: string;
  valor: string;
  recorrencia: string;
  inicioEm: string;
  status: string;
  observacoes: string;
};

export function FormularioClienteServico({
  clienteId,
  vinculo,
  catalogo,
  aoCancelar,
  aoSalvar,
}: {
  clienteId: string;
  vinculo?: ClienteServicoDTO;
  catalogo: ServicoDTO[];
  aoCancelar: () => void;
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const opcoes = catalogo.filter((servico) => servico.ativo || servico.id === vinculo?.servicoId);
  const inicial = vinculo?.servicoId ?? opcoes[0]?.id ?? "";
  const precoInicial = catalogo.find((servico) => servico.id === inicial)?.precoPadrao ?? "";
  const [valores, setValores] = useState<Valores>({
    servicoId: inicial,
    valor: vinculo ? formatarValorCampo(vinculo.valor) : formatarValorCampo(precoInicial),
    recorrencia: vinculo?.recorrencia ?? "MENSAL",
    inicioEm: vinculo?.inicioEm ?? dataHojeIso(),
    status: vinculo?.status ?? "ATIVO",
    observacoes: vinculo?.observacoes ?? "",
  });
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function alterar(nome: keyof Valores, valor: string) {
    setValores((atual) => ({ ...atual, [nome]: valor }));
  }

  function escolherServico(servicoId: string) {
    const servico = catalogo.find((item) => item.id === servicoId);
    setValores((atual) => ({
      ...atual,
      servicoId,
      valor: servico ? formatarValorCampo(servico.precoPadrao) : atual.valor,
    }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaClienteServico.safeParse(valores);
    if (!resultado.success) {
      const mensagens = mensagensDoZod(resultado.error);
      setCampos(mensagens);
      setErro(Object.values(mensagens)[0] ?? "Revise os campos destacados.");
      return;
    }

    setEnviando(true);
    setErro("");
    setCampos({});
    const resposta = await enviarJson<{ servico: ClienteServicoDTO }>(
      vinculo ? `/api/servicos-cliente/${vinculo.id}` : `/api/clientes/${clienteId}/servicos`,
      vinculo ? "PATCH" : "POST",
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
      <h3 className="font-display text-2xl">{vinculo ? "Editar serviço vendido" : "Vender serviço"}</h3>
      <p className="mt-1 text-sm text-muted">
        O valor combinado fica neste cliente. Trocar o preço do catálogo não altera o que já foi vendido.
      </p>
      {erro ? (
        <p className="mt-4 rounded-2xl bg-clay-soft px-4 py-3 text-sm text-clay" role="alert">
          {erro}
        </p>
      ) : null}
      {opcoes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Não há serviço ativo no catálogo para vincular.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Campo label="Serviço" htmlFor="vinculo-servico" erro={campos.servicoId}>
            <select
              id="vinculo-servico"
              className={classeCampo}
              value={valores.servicoId}
              onChange={(evento) => escolherServico(evento.target.value)}
            >
              {opcoes.map((servico) => (
                <option key={servico.id} value={servico.id}>
                  {servico.nome}
                  {servico.ativo ? "" : " (inativo no catálogo)"}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            label="Valor combinado"
            htmlFor="vinculo-valor"
            erro={campos.valor}
            dica="Ao trocar o serviço, o campo volta ao preço padrão."
          >
            <input
              id="vinculo-valor"
              inputMode="decimal"
              className={classeCampo}
              placeholder="189,90"
              value={valores.valor}
              onChange={(evento) => alterar("valor", evento.target.value)}
            />
          </Campo>
          <Campo label="Cobrança" htmlFor="vinculo-recorrencia" erro={campos.recorrencia}>
            <select
              id="vinculo-recorrencia"
              className={classeCampo}
              value={valores.recorrencia}
              onChange={(evento) => alterar("recorrencia", evento.target.value)}
            >
              {RECORRENCIAS.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Início" htmlFor="vinculo-inicio" erro={campos.inicioEm}>
            <input
              id="vinculo-inicio"
              type="date"
              className={classeCampo}
              value={valores.inicioEm}
              onChange={(evento) => alterar("inicioEm", evento.target.value)}
            />
          </Campo>
          <Campo label="Situação" htmlFor="vinculo-status" erro={campos.status}>
            <select
              id="vinculo-status"
              className={classeCampo}
              value={valores.status}
              onChange={(evento) => alterar("status", evento.target.value)}
            >
              {STATUS_SERVICO_CLIENTE.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <div className="md:col-span-2">
            <Campo label="Observações" htmlFor="vinculo-observacoes" erro={campos.observacoes}>
              <textarea
                id="vinculo-observacoes"
                className={`${classeCampo} min-h-20 resize-y`}
                value={valores.observacoes}
                onChange={(evento) => alterar("observacoes", evento.target.value)}
              />
            </Campo>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {opcoes.length > 0 ? (
          <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
            {enviando ? "Salvando..." : vinculo ? "Salvar serviço" : "Vincular serviço"}
          </button>
        ) : null}
        <button type="button" className={classeBotaoSecundario} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
