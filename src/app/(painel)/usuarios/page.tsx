import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioUsuario } from "@/components/formulario-usuario";
import { rotuloPapel } from "@/lib/rotulos";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarUsuarios } from "@/server/services/usuario-service";
import { redirect } from "next/navigation";

export const metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const acesso = await acessoDaPagina();
  if (acesso.papel !== "DONO") redirect("/");
  const usuarios = await listarUsuarios(acesso.empresaId);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Usuários"
        descricao="Quem entra nesta empresa. O dono cadastra a equipe. Financeiro altera clientes, serviços e valores. Suporte altera o cadastro de clientes e só consulta serviços e valores."
      />
      <div className="mb-6 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium">E-mail</th>
              <th className="px-5 py-3 font-medium">Papel</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-b border-line last:border-0">
                <td className="px-5 py-4 font-medium">
                  {usuario.nome}
                  {usuario.superadministrador ? (
                    <span className="ml-2 text-xs font-normal text-muted">Administração da plataforma</span>
                  ) : null}
                </td>
                <td className="px-5 py-4">{usuario.email}</td>
                <td className="px-5 py-4">{rotuloPapel(usuario.papel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormularioUsuario />
    </>
  );
}
