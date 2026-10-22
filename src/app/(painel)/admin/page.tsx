import { redirect } from "next/navigation";
import { BotaoStatusEmpresa } from "@/components/botao-status-empresa";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioEmpresaAdmin } from "@/components/formulario-empresa-admin";
import { rotuloStatusEmpresa } from "@/lib/rotulos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarEmpresas } from "@/server/services/empresa-service";

export const metadata = { title: "Plataforma" };

export default async function PaginaAdmin() {
  const acesso = await acessoDaPagina();
  if (!acesso.superadministrador) redirect("/");
  const empresas = await listarEmpresas();

  return (
    <>
      <CabecalhoPagina
        olho="Plataforma"
        titulo="Empresas"
        descricao="Contas assinantes. Suspender impede o login de todo mundo daquela empresa. Os clientes delas continuam invisíveis para as outras."
      />
      <div className="mb-6 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Empresa</th>
              <th className="px-5 py-3 font-medium">CNPJ</th>
              <th className="px-5 py-3 font-medium">Plano</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Usuários</th>
              <th className="px-5 py-3 font-medium">Clientes</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((empresa) => (
              <tr key={empresa.id} className="border-b border-line last:border-0">
                <td className="px-5 py-4">
                  <p className="font-medium">{empresa.nomeFantasia}</p>
                  <p className="text-muted">{empresa.razaoSocial}</p>
                </td>
                <td className="px-5 py-4 tabular-nums">{empresa.cnpj}</td>
                <td className="px-5 py-4">{empresa.plano}</td>
                <td className="px-5 py-4">{rotuloStatusEmpresa(empresa.status)}</td>
                <td className="px-5 py-4 tabular-nums">{empresa.quantidadeUsuarios}</td>
                <td className="px-5 py-4 tabular-nums">{empresa.quantidadeClientes}</td>
                <td className="px-5 py-4">
                  <BotaoStatusEmpresa
                    empresaId={empresa.id}
                    status={empresa.status}
                    propria={empresa.id === acesso.empresaId}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormularioEmpresaAdmin />
    </>
  );
}
