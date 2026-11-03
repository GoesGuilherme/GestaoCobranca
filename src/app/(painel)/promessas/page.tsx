import Link from "next/link";
import { CabecalhoPagina } from "@/components/cabecalho";
import { classeCampo } from "@/components/campo";
import { classeBotaoPrimario } from "@/components/estilos";
import { ListaPromessas } from "@/components/lista-promessas";
import { podeVerFaturas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarPromessas } from "@/server/services/promessa-service";

export const metadata = { title: "Promessas" };

const SITUACOES = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "hoje", rotulo: "Vencem hoje" },
  { valor: "quebradas", rotulo: "Quebradas" },
  { valor: "cumpridas", rotulo: "Cumpridas" },
  { valor: "canceladas", rotulo: "Canceladas" },
  { valor: "todas", rotulo: "Todas" },
];

type Busca = { situacao?: string };

export default async function PaginaPromessas({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Promessas ficam com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode ver as promessas de pagamento."
      />
    );
  }
  const situacao = SITUACOES.some((item) => item.valor === params.situacao) ? params.situacao! : "pendentes";
  const promessas = await listarPromessas(acesso, { situacao });

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Promessas de pagamento"
        descricao="Acordos para pagar uma fatura em aberto. Enquanto a promessa está pendente, a régua dessa fatura fica pausada."
      />
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-3xl border border-line bg-card p-4" method="get">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <select name="situacao" defaultValue={situacao} className={classeCampo}>
            {SITUACOES.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={classeBotaoPrimario}>
          Filtrar
        </button>
      </form>
      <ListaPromessas promessas={promessas} />
      <p className="mt-4 text-sm text-muted">
        Para registrar, abra a fatura em <Link href="/faturas" className="text-canopy hover:underline">Faturas</Link> e
        escolha Registrar promessa. Dá para editar ou cancelar enquanto ela está pendente.
      </p>
    </>
  );
}
