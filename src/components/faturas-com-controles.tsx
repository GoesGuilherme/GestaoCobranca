"use client";

import { useMemo, useState } from "react";
import { compararDinheiro } from "@/lib/dinheiro";
import type { EnvioReguaLista, ReguaParaProgresso } from "@/lib/regua-progresso";
import type { PassoParaRotulo } from "@/lib/regua";
import type { ClienteServicoDTO, FaturaDTO, PreferenciasCobrancaDTO } from "@/lib/tipos";
import { classeCampo } from "./campo";
import { Paginacao } from "./paginacao";
import { TabelaFaturas } from "./tabela-faturas";

type Ordem = "padrao" | "vencimento" | "valor" | "cliente";

const TAMANHO = 20;

export function FaturasComControles({
  faturas,
  podeCancelar,
  mostrarCliente,
  preferencias,
  reguasEnvio,
  enviosRegua = [],
  podeEnviarRegua,
  modoTeste,
  emailLogado,
  vinculos,
  passosCliente,
  hoje,
  destaqueId,
}: {
  faturas: FaturaDTO[];
  podeCancelar: boolean;
  mostrarCliente: boolean;
  preferencias?: PreferenciasCobrancaDTO;
  reguasEnvio?: ReguaParaProgresso[];
  enviosRegua?: EnvioReguaLista[];
  podeEnviarRegua?: boolean;
  modoTeste?: boolean;
  emailLogado?: string;
  vinculos?: ClienteServicoDTO[];
  passosCliente?: PassoParaRotulo[] | null;
  hoje?: string;
  destaqueId?: string | null;
}) {
  const [ordem, setOrdem] = useState<Ordem>("padrao");
  const [pagina, setPagina] = useState(1);

  const ordenadas = useMemo(() => {
    if (ordem === "padrao") return faturas;
    const lista = [...faturas];
    lista.sort((a, b) => {
      if (ordem === "valor") return compararDinheiro(b.valor, a.valor);
      if (ordem === "cliente") return a.nomeCliente.localeCompare(b.nomeCliente, "pt-BR");
      return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0;
    });
    return lista;
  }, [faturas, ordem]);

  const paginaSegura = Math.min(pagina, Math.max(1, Math.ceil(ordenadas.length / TAMANHO)));
  const fatia = ordenadas.slice((paginaSegura - 1) * TAMANHO, paginaSegura * TAMANHO);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          {faturas.length === 1 ? "1 fatura nesta lista" : `${faturas.length} faturas nesta lista`}
        </p>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Ordenar</span>
          <select
            className={classeCampo}
            value={ordem}
            aria-label="Ordenar faturas"
            onChange={(evento) => {
              setOrdem(evento.target.value as Ordem);
              setPagina(1);
            }}
          >
            <option value="padrao">Ordem da situação</option>
            <option value="vencimento">Vencimento</option>
            <option value="valor">Maior valor</option>
            <option value="cliente">Cliente</option>
          </select>
        </label>
      </div>
      <TabelaFaturas
        faturas={fatia}
        podeCancelar={podeCancelar}
        mostrarCliente={mostrarCliente}
        preferencias={preferencias}
        reguasEnvio={reguasEnvio}
        enviosRegua={enviosRegua}
        podeEnviarRegua={podeEnviarRegua}
        modoTeste={modoTeste}
        emailLogado={emailLogado}
        vinculos={vinculos}
        passosCliente={passosCliente}
        hoje={hoje}
        destaqueId={destaqueId}
      />
      <Paginacao pagina={paginaSegura} total={ordenadas.length} tamanho={TAMANHO} onChange={setPagina} />
    </div>
  );
}
