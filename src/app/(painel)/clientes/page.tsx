import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeBotaoPrimario, classeBotaoSecundario } from "@/components/estilos";
import { classeCampo } from "@/components/campo";
import { Selo } from "@/components/selo";
import { SEGMENTOS, STATUS_CLIENTE } from "@/lib/rotulos";
import { listarClientes } from "@/server/services/cliente-service";

export const metadata = { title: "Clientes" };

type Busca = {
  q?: string;
  segmento?: string;
  status?: string;
};

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const segmento = params.segmento ?? "";
  const status = params.status ?? "";
  const clientes = await listarClientes({ q, segmento, status });
  const filtrando = Boolean(q || segmento || status);

  return (
    <>
      <CabecalhoPagina
        olho="Grupos do PDVLegal"
        titulo="Clientes"
        descricao="Busque pelo nome fantasia, razão social, CPF/CNPJ ou cidade."
        acao={
          <Link href="/clientes/novo" className={classeBotaoPrimario}>
            Novo cliente
          </Link>
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded-3xl border border-line bg-card p-4 md:grid-cols-[1fr_180px_180px_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Nome, CNPJ ou cidade"
          aria-label="Buscar por nome, CNPJ ou cidade"
          className={classeCampo}
        />
        <select name="segmento" defaultValue={segmento} aria-label="Segmento" className={classeCampo}>
          <option value="">Todos os segmentos</option>
          {SEGMENTOS.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} aria-label="Status" className={classeCampo}>
          <option value="">Todos os status</option>
          {STATUS_CLIENTE.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button type="submit" className={classeBotaoPrimario}>
            Buscar
          </button>
          {filtrando ? (
            <Link href="/clientes" className={classeBotaoSecundario}>
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <p className="mb-3 text-sm text-muted">
        {clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}
      </p>

      {clientes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-12 text-center">
          <p className="font-display text-2xl">
            {filtrando ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          </p>
          <p className="mt-2 text-muted">
            {filtrando
              ? "Tente outro nome, CNPJ ou cidade, ou limpe os filtros."
              : "Comece pelo primeiro grupo do PDVLegal."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Documento</th>
                <th className="px-5 py-3 font-medium">Cidade</th>
                <th className="px-5 py-3 font-medium">Segmento</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Filiais</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-4">
                    <Link href={`/clientes/${cliente.id}`} className="font-medium hover:underline">
                      {cliente.nomeFantasia}
                    </Link>
                    <p className="mt-0.5 text-muted">{cliente.razaoSocial}</p>
                  </td>
                  <td className="px-5 py-4 tabular-nums">{cliente.documento}</td>
                  <td className="px-5 py-4">
                    {cliente.cidade}/{cliente.uf}
                  </td>
                  <td className="px-5 py-4">
                    <Selo valor={cliente.segmento} tipo="segmento" />
                  </td>
                  <td className="px-5 py-4">
                    <Selo valor={cliente.status} tipo="cliente" />
                  </td>
                  <td className="px-5 py-4 tabular-nums">{cliente.quantidadeFiliais}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
