"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { enviarJson } from "@/lib/api-cliente";
import { dataHojeIso } from "@/lib/data";
import { CANAIS_PROMESSA, rotuloCanalPromessa } from "@/lib/promessa";
import type { CanalPromessa, PromessaPendenteDTO } from "@/lib/tipos";
import { esquemaPromessa, mensagensDoZod } from "@/lib/validacao";
import { Campo, classeCampo } from "./campo";
import { classeBotaoPerigo, classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { avisarCamposObrigatorios, avisarErro, avisarSucesso } from "./notificador";

export function DialogoPromessa({
  aberto,
  faturaId,
  valorFatura,
  promessa,
  onFechar,
}: {
  aberto: boolean;
  faturaId: string;
  valorFatura: string;
  promessa: PromessaPendenteDTO | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const tituloId = useId();
  const [dataPrometida, setDataPrometida] = useState(promessa?.dataPrometida ?? dataHojeIso());
  const [valorPrometido, setValorPrometido] = useState(promessa?.valorPrometido ?? valorFatura);
  const [canal, setCanal] = useState<CanalPromessa>(promessa?.canal ?? "WHATSAPP");
  const [observacao, setObservacao] = useState(promessa?.observacao ?? "");
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDataPrometida(promessa?.dataPrometida ?? dataHojeIso());
    setValorPrometido(promessa?.valorPrometido ?? valorFatura);
    setCanal(promessa?.canal ?? "WHATSAPP");
    setObservacao(promessa?.observacao ?? "");
    setCampos({});
  }, [aberto, promessa, valorFatura]);

  useEffect(() => {
    if (!aberto) return;
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape" && !enviando) onFechar();
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto, enviando, onFechar]);

  if (!aberto) return null;

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = esquemaPromessa.safeParse({ dataPrometida, valorPrometido, canal, observacao });
    if (!resultado.success) {
      setCampos(mensagensDoZod(resultado.error));
      avisarCamposObrigatorios();
      return;
    }
    setEnviando(true);
    setCampos({});
    const resposta = promessa
      ? await enviarJson(`/api/promessas/${promessa.id}`, "PATCH", resultado.data)
      : await enviarJson(`/api/faturas/${faturaId}/promessas`, "POST", resultado.data);
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      setCampos(resposta.campos ?? {});
      return;
    }
    avisarSucesso(promessa ? "Promessa atualizada" : "Promessa registrada");
    onFechar();
    router.refresh();
  }

  async function cancelar() {
    if (!promessa) return;
    setEnviando(true);
    const resposta = await enviarJson(`/api/promessas/${promessa.id}/cancelar`, "POST");
    setEnviando(false);
    if (!resposta.ok) {
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Promessa cancelada");
    onFechar();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/50 p-4 sm:items-center">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onSubmit={salvar}
        noValidate
        className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl"
      >
        <h2 id={tituloId} className="font-display text-2xl text-ink">
          {promessa ? "Editar promessa" : "Registrar promessa"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Enquanto a promessa estiver pendente, a régua não cobra esta fatura. O valor pode ser só uma parte da fatura.
        </p>
        {promessa ? (
          <p className="mt-2 text-sm text-muted">
            Registrada por {promessa.registradaPor} · canal {rotuloCanalPromessa(promessa.canal)}.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4">
          <Campo label="Data prometida" htmlFor={`promessa-data-${faturaId}`} erro={campos.dataPrometida} obrigatorio>
            <input
              id={`promessa-data-${faturaId}`}
              type="date"
              min={dataHojeIso()}
              className={classeCampo}
              value={dataPrometida}
              onChange={(evento) => setDataPrometida(evento.target.value)}
            />
          </Campo>
          <Campo label="Valor prometido" htmlFor={`promessa-valor-${faturaId}`} erro={campos.valorPrometido} dica={`A fatura é de ${valorFatura}.`} obrigatorio>
            <input
              id={`promessa-valor-${faturaId}`}
              inputMode="decimal"
              className={classeCampo}
              value={valorPrometido}
              onChange={(evento) => setValorPrometido(evento.target.value)}
            />
          </Campo>
          <Campo label="Canal" htmlFor={`promessa-canal-${faturaId}`} erro={campos.canal} obrigatorio>
            <select
              id={`promessa-canal-${faturaId}`}
              className={classeCampo}
              value={canal}
              onChange={(evento) => setCanal(evento.target.value as CanalPromessa)}
            >
              {CANAIS_PROMESSA.map((item) => (
                <option key={item.valor} value={item.valor}>
                  {item.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Observação" htmlFor={`promessa-obs-${faturaId}`} erro={campos.observacao}>
            <textarea
              id={`promessa-obs-${faturaId}`}
              className={classeCampo}
              rows={3}
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
            />
          </Campo>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {promessa ? (
            <button type="button" className={classeBotaoPerigo} disabled={enviando} onClick={() => void cancelar()}>
              Cancelar promessa
            </button>
          ) : null}
          <button type="button" className={classeBotaoSecundario} disabled={enviando} onClick={onFechar}>
            Voltar
          </button>
          <button type="submit" className={classeBotaoPrimario} disabled={enviando}>
            {enviando ? "Salvando..." : promessa ? "Salvar" : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
