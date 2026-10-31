import { BarraLateral } from "@/components/barra-lateral";
import { podeVerFaturas, podeVerRegua } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";

export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const acesso = await acessoDaPagina();

  return (
    <div className="min-h-screen">
      <BarraLateral
        nome={acesso.nome}
        email={acesso.email}
        nomeEmpresa={acesso.nomeEmpresa}
        mostrarUsuarios={acesso.papel === "DONO"}
        mostrarFaturas={podeVerFaturas(acesso.papel)}
        mostrarRegua={podeVerRegua(acesso.papel)}
        mostrarAsaas={acesso.papel === "DONO"}
        mostrarAdmin={acesso.superadministrador}
      />
      <div className="md:pl-64">
        <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
