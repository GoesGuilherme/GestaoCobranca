import { AbasDashboards } from "@/components/abas-dashboards";
import { podeVerFaturas, podeVerResultado } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";

export default async function LayoutDashboards({ children }: { children: React.ReactNode }) {
  const acesso = await acessoDaPagina();

  return (
    <>
      <AbasDashboards
        mostrarFinanceiro={podeVerFaturas(acesso.papel)}
        mostrarResultado={podeVerResultado(acesso.papel)}
      />
      {children}
    </>
  );
}
