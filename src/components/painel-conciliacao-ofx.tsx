"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarJson } from "@/lib/api-cliente";
import { confirmarOfxHabilitado, importarOfxHabilitado } from "@/lib/ofx/formulario";
import type { PainelOfx, ResumoOfx, SugestaoOfx } from "@/lib/ofx/tipos";
import { SeloFatura } from "./selo";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { EstadoVazio } from "./estado-vazio";
import { avisarErro, avisarSucesso } from "./notificador";

function textoResumo(resumo: ResumoOfx): string {
  const partes = [
    `${resumo.baixadas} baixadas automaticamente`,
    `${resumo.sugestoes} sugestões para confirmar`,
    `${resumo.naoIdentificadas} não identificadas`,
  ];
  if (resumo.jaImportadas > 0) partes.push(`${resumo.jaImportadas} já importadas`);
  return partes.join(", ");
}

export function PainelConciliacaoOfx({ painel }: { painel: PainelOfx }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [acao, setAcao] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const podeImportar = importarOfxHabilitado(arquivo ? { nome: arquivo.name, tamanho: arquivo.size } : null);

  async function importar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!arquivo || !podeImportar || enviando) return;
    setEnviando(true);
    const corpo = new FormData();
    corpo.set("arquivo", arquivo);
    let resposta: Response;
    try {
      resposta = await fetch("/api/faturas/conciliacao", { method: "POST", body: corpo });
    } catch {
      setEnviando(false);
      avisarErro("Não foi possível falar com o servidor.");
      return;
    }
    const dados = (await resposta.json().catch(() => ({}))) as { erro?: string; resumo?: ResumoOfx };
    setEnviando(false);
    if (!resposta.ok || !dados.resumo) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(dados.erro ?? "Não foi possível importar o extrato.");
      return;
    }
    setArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
    avisarSucesso(textoResumo(dados.resumo));
    router.refresh();
  }

  async function confirmar(sugestao: SugestaoOfx) {
    const faturaId = sugestao.candidatas.length === 1 ? sugestao.candidatas[0].id : (escolha[sugestao.id] ?? "");
    if (acao || !confirmarOfxHabilitado(sugestao.candidatas.length, faturaId)) return;
    setAcao(sugestao.id);
    const resposta = await enviarJson("/api/faturas/conciliacao/confirmar", "POST", {
      transacaoId: sugestao.id,
      faturaId,
    });
    setAcao(null);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Cobrança marcada como paga");
    router.refresh();
  }

  async function ignorar(sugestao: SugestaoOfx) {
    if (acao) return;
    setAcao(`ignorar-${sugestao.id}`);
    const resposta = await enviarJson("/api/faturas/conciliacao/ignorar", "POST", { transacaoId: sugestao.id });
    setAcao(null);
    if (!resposta.ok) {
      if (resposta.status === 401) {
        router.push("/login");
        return;
      }
      avisarErro(resposta.erro);
      return;
    }
    avisarSucesso("Crédito ignorado");
    router.refresh();
  }

  return (
    <div className="grid gap-8">
      <form onSubmit={(evento) => void importar(evento)} className="grid gap-4 rounded-3xl border border-line bg-card p-6">
        <div>
          <h2 className="font-display text-2xl">Importar extrato</h2>
          <p className="mt-2 text-sm text-muted">
            Arquivo .ofx da conta, no formato 1.x ou 2.x. Só entram créditos. Débitos ficam de fora. O mesmo FITID não
            baixa a cobrança duas vezes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="arquivo-ofx" className={classeBotaoSecundario}>
            Escolher arquivo
            <input
              ref={inputRef}
              id="arquivo-ofx"
              name="arquivo"
              type="file"
              accept=".ofx,application/x-ofx,application/ofx"
              className="sr-only"
              onChange={(evento) => setArquivo(evento.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-sm text-muted">{arquivo ? arquivo.name : "Nenhum arquivo .ofx selecionado"}</p>
        </div>
        <div className="flex justify-end">
          <button type="submit" className={classeBotaoPrimario} disabled={!podeImportar || enviando}>
            {enviando ? "Importando..." : "Importar extrato"}
          </button>
        </div>
      </form>

      {painel.ultima ? (
        <section aria-live="polite">
          <h2 className="font-display text-2xl">Última importação</h2>
          <p className="mt-1 text-sm text-muted">
            {painel.ultima.nomeArquivo} · {painel.ultima.banco} · {painel.ultima.contaMascarada} · {painel.ultima.criadoEm}
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            <li className="rounded-3xl border border-line bg-card px-4 py-5">
              <p className="text-3xl font-medium text-ok">{painel.ultima.baixadas}</p>
              <p className="mt-1 text-sm text-muted">baixadas automaticamente</p>
            </li>
            <li className="rounded-3xl border border-line bg-card px-4 py-5">
              <p className="text-3xl font-medium text-gold-ink">{painel.ultima.sugestoes}</p>
              <p className="mt-1 text-sm text-muted">sugestões para confirmar</p>
            </li>
            <li className="rounded-3xl border border-line bg-card px-4 py-5">
              <p className="text-3xl font-medium">{painel.ultima.naoIdentificadas}</p>
              <p className="mt-1 text-sm text-muted">não identificadas</p>
            </li>
          </ul>
          {painel.ultima.jaImportadas > 0 ? (
            <p className="mt-3 text-sm text-muted">{painel.ultima.jaImportadas} créditos já estavam no histórico.</p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-2xl">Sugestões para confirmar</h2>
        {painel.sugestoes.length === 0 ? (
          <div className="mt-4">
            <EstadoVazio
              titulo="Nenhuma sugestão em aberto"
              descricao="Quando o valor bater com mais de uma cobrança, ou só o valor bater, a confirmação fica aqui."
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-4">
            {painel.sugestoes.map((sugestao) => {
              const selecionada = sugestao.candidatas.length === 1 ? sugestao.candidatas[0].id : (escolha[sugestao.id] ?? "");
              const podeConfirmar = confirmarOfxHabilitado(sugestao.candidatas.length, selecionada);
              const ocupado = acao === sugestao.id || acao === `ignorar-${sugestao.id}`;
              return (
                <li key={sugestao.id} className="rounded-3xl border border-line bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-medium">{sugestao.valor}</p>
                      <p className="text-sm text-muted">
                        {sugestao.data}
                        {sugestao.nome ? ` · ${sugestao.nome}` : ""}
                      </p>
                      {sugestao.descricao ? <p className="mt-1 text-sm text-ink">{sugestao.descricao}</p> : null}
                    </div>
                    <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-semibold text-gold-ink">Sugestão</span>
                  </div>
                  {sugestao.candidatas.length === 0 ? (
                    <p className="mt-4 text-sm text-muted">As cobranças sugeridas não estão mais em aberto.</p>
                  ) : (
                    <fieldset className="mt-4 grid gap-2">
                      <legend className="text-sm font-medium">Cobrança</legend>
                      {sugestao.candidatas.map((candidata) => {
                        const varias = sugestao.candidatas.length > 1;
                        return (
                          <label key={candidata.id} className="flex items-start gap-3 rounded-2xl border border-line px-3 py-3">
                            {varias ? (
                              <input
                                type="radio"
                                className="mt-1"
                                name={`fatura-${sugestao.id}`}
                                checked={escolha[sugestao.id] === candidata.id}
                                onChange={() => setEscolha((atual) => ({ ...atual, [sugestao.id]: candidata.id }))}
                              />
                            ) : null}
                            <span className="grid gap-1">
                              <span className="font-medium">{candidata.cliente}</span>
                              <span className="text-sm text-muted">
                                {candidata.valor} · vence {candidata.vencimento}
                              </span>
                              <SeloFatura status={candidata.status} excluida={false} />
                            </span>
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      className={classeBotaoSecundario}
                      disabled={ocupado}
                      onClick={() => void ignorar(sugestao)}
                    >
                      Ignorar
                    </button>
                    <button
                      type="button"
                      className={classeBotaoPrimario}
                      disabled={ocupado || !podeConfirmar}
                      onClick={() => void confirmar(sugestao)}
                    >
                      {acao === sugestao.id ? "Salvando..." : "Confirmar pagamento"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl">Não identificadas</h2>
        <p className="mt-1 text-sm text-muted">Créditos da última importação sem cobrança Pix em aberto com o mesmo valor.</p>
        {painel.naoIdentificadas.length === 0 ? (
          <div className="mt-4">
            <EstadoVazio titulo="Nenhum crédito sem identificação" descricao="A última importação não deixou crédito de fora." />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {painel.naoIdentificadas.map((item) => (
              <li key={item.id} className="rounded-3xl border border-line bg-card px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.valor}</p>
                  <span className="rounded-full bg-sand px-2.5 py-1 text-xs font-semibold text-ink">Não identificada</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {item.data}
                  {item.nome ? ` · ${item.nome}` : ""}
                </p>
                {item.descricao ? <p className="mt-1 text-sm">{item.descricao}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl">Histórico</h2>
        {painel.historico.length === 0 ? (
          <div className="mt-4">
            <EstadoVazio titulo="Nenhuma importação ainda" descricao="O histórico aparece depois do primeiro extrato." />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {painel.historico.map((item) => (
              <li key={item.id} className="rounded-3xl border border-line bg-card px-4 py-4">
                <p className="font-medium">{item.nomeArquivo}</p>
                <p className="text-sm text-muted">
                  {item.criadoEm} · {item.banco} · {item.contaMascarada}
                </p>
                <p className="mt-2 text-sm">
                  {item.baixadas} baixadas · {item.sugestoes} sugestões · {item.naoIdentificadas} não identificadas
                  {item.jaImportadas > 0 ? ` · ${item.jaImportadas} já importadas` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
