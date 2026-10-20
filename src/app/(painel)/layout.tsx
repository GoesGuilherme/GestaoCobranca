import { redirect } from "next/navigation";
import { BarraLateral } from "@/components/barra-lateral";
import { obterSessao } from "@/server/auth/sessao";

export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");

  return (
    <div className="min-h-screen">
      <BarraLateral nome={sessao.nome} email={sessao.email} />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
