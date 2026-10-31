"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { compararDinheiro, formatarReais } from "@/lib/dinheiro";
import { formatarDocumento } from "@/lib/documento";
import { formatarDataIso } from "@/lib/formatacao";
import type { ClienteResumo } from "@/lib/tipos";
import { classeCabecalhoTabela, classeTabelaRolavel } from "./estilos";
import { Paginacao } from "./paginacao";
import { Selo } from "./selo";

type Coluna = "nome" | "cidade" | "status" | "ativacao" | "filiais" | "mensal";

const TAMANHO = 20;

function compararTexto(a: string, b: string) {
  return a.localeCompare(b, "pt-BR");
}

export function TabelaClientes({ clientes }: { clientes: ClienteResumo[] }) {
  const [coluna, setColuna] = useState<Coluna>("nome");
  const [direcao, setDirecao] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(1);

  const ordenados = useMemo(() => {
    const lista = [...clientes];
    const fator = direcao === "asc" ? 1 : -1;
    lista.sort((a, b) => {
      if (coluna === "cidade") return fator * compararTexto(`${a.cidade}/${a.uf}`, `${b.cidade}/${b.uf}`);
      if (coluna === "status") return fator * compararTexto(a.status, b.status);
      if (coluna === "ativacao") return fator * compararTexto(a.ativadoEm ?? "", b.ativadoEm ?? "");
      if (coluna === "filiais") return fator * (a.quantidadeFiliais - b.quantidadeFiliais);
      if (coluna === "mensal") return fator * compararDinheiro(a.valorMensalAtivo, b.valorMensalAtivo);
      return fator * compararTexto(a.nomeFantasia, b.nomeFantasia);
    });
    return lista;
  }, [clientes, coluna, direcao]);

  const paginaSegura = Math.min(pagina, Math.max(1, Math.ceil(ordenados.length / TAMANHO)));
  const fatia = ordenados.slice((paginaSegura - 1) * TAMANHO, paginaSegura * TAMANHO);

  function ordenar(proxima: Coluna) {
    setPagina(1);
    if (proxima === coluna) {
      setDirecao((atual) => (atual === "asc" ? "desc" : "asc"));
      return;
    }
    setColuna(proxima);
    setDirecao(proxima === "mensal" || proxima === "filiais" ? "desc" : "asc");
  }

  function cabecalho(id: Coluna, texto: string) {
    const ativo = coluna === id;
    return (
      <th
        className="px-5 py-3 text-left font-medium"
        aria-sort={ativo ? (direcao === "asc" ? "ascending" : "descending") : "none"}
      >
        <button type="button" className="cursor-pointer uppercase tracking-wide hover:text-ink" onClick={() => ordenar(id)}>
          {texto}
          {ativo ? (direcao === "asc" ? " ↑" : " ↓") : ""}
        </button>
      </th>
    );
  }

  return (
    <>
      <div className={classeTabelaRolavel}>
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className={classeCabecalhoTabela}>
            <tr>
              {cabecalho("nome", "Cliente")}
              <th className="px-5 py-3 text-left font-medium">Documento</th>
              {cabecalho("cidade", "Cidade")}
              <th className="px-5 py-3 text-left font-medium">Segmento</th>
              {cabecalho("status", "Status")}
              {cabecalho("ativacao", "Ativação")}
              {cabecalho("filiais", "Filiais")}
              {cabecalho("mensal", "Mensal")}
            </tr>
          </thead>
          <tbody>
            {fatia.map((cliente) => (
              <tr key={cliente.id} className="border-b border-line last:border-0">
                <td className="px-5 py-4">
                  <Link href={`/clientes/${cliente.id}`} className="font-medium text-canopy hover:underline">
                    {cliente.nomeFantasia}
                  </Link>
                  <p className="mt-0.5 text-muted">{cliente.razaoSocial}</p>
                </td>
                <td className="px-5 py-4 tabular-nums">{formatarDocumento(cliente.documento, cliente.tipoDocumento)}</td>
                <td className="px-5 py-4">
                  {cliente.cidade}/{cliente.uf}
                </td>
                <td className="px-5 py-4">
                  <Selo valor={cliente.segmento} tipo="segmento" />
                </td>
                <td className="px-5 py-4">
                  <Selo valor={cliente.status} tipo="cliente" />
                </td>
                <td className="px-5 py-4 tabular-nums">{cliente.ativadoEm ? formatarDataIso(cliente.ativadoEm) : "—"}</td>
                <td className="px-5 py-4 tabular-nums">{cliente.quantidadeFiliais}</td>
                <td className="px-5 py-4 tabular-nums">{formatarReais(cliente.valorMensalAtivo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginacao pagina={paginaSegura} total={ordenados.length} tamanho={TAMANHO} onChange={setPagina} />
    </>
  );
}
