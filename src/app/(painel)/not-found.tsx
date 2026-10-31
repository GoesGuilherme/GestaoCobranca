import Link from "next/link";
import { classeBotaoPrimario } from "@/components/estilos";

export default function NaoEncontradoPainel() {
  return (
    <div className="rounded-3xl border border-line bg-card px-6 py-12">
      <p className="text-sm font-medium text-gold-ink">Não encontrado</p>
      <h1 className="mt-2 font-display text-4xl">Esse cadastro não existe</h1>
      <p className="mt-3 max-w-lg text-muted">
        O cliente pode ter sido excluído, ou o endereço está incompleto.
      </p>
      <Link
        href="/clientes"
        className={`${classeBotaoPrimario} mt-6`}
      >
        Ver clientes
      </Link>
    </div>
  );
}
