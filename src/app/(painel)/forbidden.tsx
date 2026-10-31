import Link from "next/link";
import { classeBotaoPrimario } from "@/components/estilos";

export default function AcessoNegado() {
  return (
    <div className="rounded-3xl border border-line bg-card px-6 py-12">
      <p className="text-sm font-medium text-gold-ink">Acesso negado</p>
      <h1 className="mt-2 font-display text-4xl">Só o dono vê esta página</h1>
      <p className="mt-3 max-w-lg text-muted">
        O resultado de custo e faturamento fica com o dono da empresa. Financeiro e suporte não entram aqui.
      </p>
      <Link
        href="/"
        className={`${classeBotaoPrimario} mt-6`}
      >
        Voltar ao painel
      </Link>
    </div>
  );
}
