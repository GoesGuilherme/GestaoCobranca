import { CabecalhoPagina } from "@/components/cabecalho";
import { podeConfigurarAsaas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { redirect } from "next/navigation";

export const metadata = { title: "Asaas" };

export default async function PaginaAsaas() {
  const acesso = await acessoDaPagina();
  if (!podeConfigurarAsaas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Só o dono configura o Asaas"
        descricao="A chave da API e o token do webhook ficam com o dono da empresa."
      />
    );
  }
  redirect("/banco#asaas");
}
