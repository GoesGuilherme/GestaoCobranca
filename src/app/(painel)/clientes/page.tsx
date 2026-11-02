import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeBotaoPrimario, classeBotaoSecundario } from "@/components/estilos";
import { classeCampo } from "@/components/campo";
import { EstadoVazio } from "@/components/estado-vazio";
import { TabelaClientes } from "@/components/tabela-clientes";
import { SEGMENTOS, STATUS_CLIENTE } from "@/lib/rotulos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { classificarPagadoresDaEmpresa } from "@/server/services/classificacao-pagador-service";
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
  const acesso = await acessoDaPagina();
  const q = params.q?.trim() ?? "";
  const segmento = params.segmento ?? "";
  const status = params.status ?? "";
  const clientes = await listarClientes(acesso.empresaId, { q, segmento, status });
  const selos = Object.fromEntries(
    await classificarPagadoresDaEmpresa(
      acesso.empresaId,
      clientes.map((cliente) => cliente.id),
    ),
  );
  const filtrando = Boolean(q || segmento || status);

  return (
    <>
      <CabecalhoPagina
        olho="Clientes da empresa"
        titulo="Clientes"
        descricao="Busque pelo nome fantasia, razão social, CPF/CNPJ ou cidade."
        acao={
          <Link href="/clientes/novo" className={classeBotaoPrimario}>
            Novo cliente
          </Link>
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded-3xl border border-line bg-card p-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Busca</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Nome, CNPJ ou cidade"
            aria-label="Buscar por nome, CNPJ ou cidade"
            className={classeCampo}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Segmento</span>
        <select name="segmento" defaultValue={segmento} aria-label="Segmento" className={classeCampo}>
          <option value="">Todos os segmentos</option>
          {SEGMENTOS.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Status</span>
        <select name="status" defaultValue={status} aria-label="Status" className={classeCampo}>
          <option value="">Todos os status</option>
          {STATUS_CLIENTE.map((item) => (
            <option key={item.valor} value={item.valor}>
              {item.rotulo}
            </option>
          ))}
        </select>
        </label>
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
        <EstadoVazio
          titulo={filtrando ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          descricao={
            filtrando
              ? "Tente outro nome, CNPJ ou cidade, ou limpe os filtros."
              : "Comece pelo primeiro cliente. O cadastro leva nome, documento e um contato."
          }
          acao={
            filtrando ? undefined : (
              <Link href="/clientes/novo" className={classeBotaoPrimario}>
                Novo cliente
              </Link>
            )
          }
        />
      ) : (
        <TabelaClientes clientes={clientes} selos={selos} />
      )}
    </>
  );
}
