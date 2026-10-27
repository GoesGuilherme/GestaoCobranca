"use client";

import { useEffect, useState } from "react";
import { PREFERENCIAS_COBRANCA_PADRAO } from "@/lib/cobranca";
import { formatarReais, somarDinheiro } from "@/lib/dinheiro";
import { faturasNaSituacao, faturaNaSituacao } from "@/lib/fatura-situacao";
import { formatarDataIso } from "@/lib/formatacao";
import { dataSaoPaulo, type OpcaoPassoRegua, type PassoParaRotulo } from "@/lib/regua";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO, SituacaoFatura } from "@/lib/tipos";
import { AcoesCompartilhar } from "./acoes-compartilhar";
import { FormularioFatura } from "./formulario-fatura";
import { classeBotaoPrimario, classeBotaoSecundario } from "./estilos";
import { TabelaFaturas } from "./tabela-faturas";

const ABAS: { valor: SituacaoFatura; rotulo: string; legenda: string }[] = [
  {
    valor: "em_aberto",
    rotulo: "Em aberto",
    legenda: "Em aberto e vencidas deste cliente, da data mais próxima para a mais distante.",
  },
  {
    valor: "pagas",
    rotulo: "Pagas",
    legenda: "Pagas deste cliente, da mais recente para a mais antiga.",
  },
  {
    valor: "canceladas",
    rotulo: "Canceladas",
    legenda: "Canceladas deste cliente, da mais recente para a mais antiga.",
  },
  {
    valor: "todas",
    rotulo: "Todas",
    legenda: "Todas as faturas deste cliente, da data de vencimento mais recente para a mais antiga.",
  },
];

function tituloEmissao(forma: string) {
  if (forma === "PIX") return "Pix emitido";
  if (forma === "CREDIT_CARD") return "Cobrança no cartão emitida";
  if (forma === "UNDEFINED") return "Cobrança emitida";
  return "Boleto emitido";
}

function textoDoLink(forma: string, boleto: boolean) {
  if (forma === "CREDIT_CARD") return "Abrir página para cadastrar o cartão";
  if (boleto) return "Abrir boleto";
  return "Abrir cobrança";
}

function resumo(faturas: FaturaDTO[], hoje: string) {
  const abertas = faturas.filter((fatura) => faturaNaSituacao(fatura, "em_aberto"));
  const vencidas = faturas.filter((fatura) => faturaNaSituacao(fatura, "vencidas"));
  const pagasNoMes = faturas.filter(
    (fatura) => faturaNaSituacao(fatura, "pagas") && dataSaoPaulo(new Date(fatura.atualizadoEm)).slice(0, 7) === hoje.slice(0, 7),
  );
  const futuras = abertas
    .filter((fatura) => fatura.vencimento >= hoje)
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0));
  return {
    emAberto: somarDinheiro(abertas.map((fatura) => fatura.valor)),
    vencido: somarDinheiro(vencidas.map((fatura) => fatura.valor)),
    pagoNoMes: somarDinheiro(pagasNoMes.map((fatura) => fatura.valor)),
    proximo: futuras[0]?.vencimento ?? null,
  };
}

export function PainelFaturasCliente({
  clienteId,
  vinculos,
  faturas,
  podeCancelar,
  preferencias = PREFERENCIAS_COBRANCA_PADRAO,
  passosRegua = [],
  podeEnviarRegua = false,
  passosCliente = null,
  hoje,
  modoTeste = false,
  emailLogado = "",
}: {
  clienteId: string;
  vinculos: ClienteServicoDTO[];
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  preferencias?: PreferenciasCobrancaDTO;
  passosRegua?: OpcaoPassoRegua[];
  podeEnviarRegua?: boolean;
  passosCliente?: PassoParaRotulo[] | null;
  hoje: string;
  modoTeste?: boolean;
  emailLogado?: string;
}) {
  const [emitida, setEmitida] = useState<FaturaDTO | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoFatura>("em_aberto");
  const lista = faturasNaSituacao(faturas, situacao);
  const aba = ABAS.find((item) => item.valor === situacao) ?? ABAS[0];
  const totais = resumo(faturas, hoje);

  useEffect(() => {
    if (!emitida) return;
    document.getElementById(`fatura-${emitida.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [emitida, faturas]);

  const link = emitida ? (emitida.boletoUrl ?? emitida.faturaUrl) : null;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl">Faturas</h2>
        {podeCancelar ? (
          <button type="button" className={emitindo ? classeBotaoSecundario : classeBotaoPrimario} onClick={() => setEmitindo((atual) => !atual)}>
            {emitindo ? "Fechar emissão" : "Emitir cobrança avulsa"}
          </button>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted">{aba.legenda}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Em aberto</dt>
          <dd className="mt-1 font-display text-2xl">{formatarReais(totais.emAberto)}</dd>
          <p className="text-xs text-muted">inclui o vencido</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Vencido</dt>
          <dd className="mt-1 font-display text-2xl text-clay">{formatarReais(totais.vencido)}</dd>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Pago no mês</dt>
          <dd className="mt-1 font-display text-2xl">{formatarReais(totais.pagoNoMes)}</dd>
        </div>
        <div className="rounded-2xl border border-line bg-card px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Próximo vencimento</dt>
          <dd className="mt-1 font-display text-2xl">{totais.proximo ? formatarDataIso(totais.proximo) : "—"}</dd>
          {totais.proximo ? null : <p className="text-xs text-muted">Nenhum vencimento futuro</p>}
        </div>
      </dl>
      <div role="tablist" aria-label="Situação das faturas" className="mt-4 flex flex-wrap gap-2">
        {ABAS.map((item) => {
          const quantidade = faturas.filter((fatura) => faturaNaSituacao(fatura, item.valor)).length;
          const ativa = situacao === item.valor;
          return (
            <button
              key={item.valor}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={ativa ? classeBotaoPrimario : classeBotaoSecundario}
              onClick={() => setSituacao(item.valor)}
            >
              {item.rotulo} ({quantidade})
            </button>
          );
        })}
      </div>
      {emitindo ? (
        <div className="mt-4">
          <FormularioFatura
            clienteId={clienteId}
            vinculos={vinculos}
            preferencias={preferencias}
            onEmitida={(fatura) => {
              setEmitida(fatura);
              setSituacao("em_aberto");
              setEmitindo(false);
            }}
          />
        </div>
      ) : null}
      {emitida ? (
        <div role="status" className="mt-4 rounded-2xl border border-ok/20 bg-leaf px-4 py-3 text-sm text-ok">
          <p className="font-medium">{tituloEmissao(emitida.formaCobranca)}</p>
          <p className="mt-1">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className="font-medium underline">
                {textoDoLink(emitida.formaCobranca, Boolean(emitida.boletoUrl))}
              </a>
            ) : (
              "O link ainda não voltou do Asaas."
            )}
          </p>
          <div className="mt-3">
            <AcoesCompartilhar
              link={link}
              whatsapp={emitida.whatsapp}
              email={emitida.email}
              cliente={emitida.nomeCliente}
              servico={emitida.nomeServico ?? ""}
              valor={emitida.valor}
              vencimento={emitida.vencimento}
              modeloMensagem={preferencias.modeloMensagem}
              modeloAssunto={preferencias.modeloAssunto}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-4">
        <TabelaFaturas
          faturas={lista}
          podeCancelar={podeCancelar}
          mostrarCliente={false}
          destaqueId={emitida?.id}
          preferencias={preferencias}
          passosRegua={passosRegua}
          podeEnviarRegua={podeEnviarRegua}
          vinculos={vinculos}
          passosCliente={passosCliente}
          hoje={hoje}
          modoTeste={modoTeste}
          emailLogado={emailLogado}
        />
      </div>
    </section>
  );
}
