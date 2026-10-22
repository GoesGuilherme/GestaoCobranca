import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioEmpresa } from "@/components/formulario-empresa";
import { cnpjCollabPendente } from "@/lib/collab";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterEmpresa } from "@/server/services/empresa-service";
import { redirect } from "next/navigation";

export const metadata = { title: "Empresa" };

export default async function PaginaEmpresa() {
  const acesso = await acessoDaPagina();
  if (acesso.papel !== "DONO") redirect("/");
  const empresa = await obterEmpresa(acesso.empresaId);

  return (
    <>
      <CabecalhoPagina
        olho="Conta"
        titulo="Empresa"
        descricao="Estes dados identificam a assinante. Clientes e usuários ficam dentro dela."
      />
      {cnpjCollabPendente(empresa.cnpj) ? (
        <p className="mb-6 rounded-2xl border border-gold/40 bg-gold/15 px-4 py-3 text-sm">
          O CNPJ 00000000000000 é um placeholder da migração. Ele não é válido. Substitua pelo CNPJ
          real da Collab Software antes de usar o cadastro em produção.
        </p>
      ) : null}
      <FormularioEmpresa empresa={empresa} />
    </>
  );
}
