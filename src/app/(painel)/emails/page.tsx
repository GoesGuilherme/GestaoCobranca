import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelEmails } from "@/components/painel-emails";
import { acessoDaPagina } from "@/server/auth/pagina";
import { resumoLogoEmpresa } from "@/server/services/logo-empresa-service";
import { obterPainelRegua } from "@/server/services/regua-service";
import { redirect } from "next/navigation";

export const metadata = { title: "Configurações de e-mail" };

export default async function PaginaEmails() {
  const acesso = await acessoDaPagina();
  if (acesso.papel !== "DONO") redirect("/");
  const [logo, painel] = await Promise.all([resumoLogoEmpresa(acesso.empresaId), obterPainelRegua(acesso)]);

  return (
    <>
      <CabecalhoPagina
        olho="Configurações"
        titulo="Configurações de e-mail"
        descricao="Quem envia os avisos da régua, a logo e a prévia. A prévia fica nesta tela e não envia nada."
      />
      <PainelEmails nomeEmpresa={acesso.nomeEmpresa} logo={logo} config={painel.config} />
    </>
  );
}
