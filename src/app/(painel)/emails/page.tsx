import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelEmails } from "@/components/painel-emails";
import { acessoDaPagina } from "@/server/auth/pagina";
import { resumoLogoEmpresa } from "@/server/services/logo-empresa-service";
import { redirect } from "next/navigation";

export const metadata = { title: "E-mails" };

export default async function PaginaEmails() {
  const acesso = await acessoDaPagina();
  if (acesso.papel !== "DONO") redirect("/");
  const logo = await resumoLogoEmpresa(acesso.empresaId);

  return (
    <>
      <CabecalhoPagina
        olho="Configurações"
        titulo="E-mails"
        descricao="A logo entra no topo dos avisos da régua. Sem logo, o cabeçalho mostra o nome da empresa. A prévia fica nesta tela e não envia nada."
      />
      <PainelEmails nomeEmpresa={acesso.nomeEmpresa} logo={logo} />
    </>
  );
}
