import { FormularioRedefinirSenha } from "@/components/formulario-redefinir-senha";
import { MolduraAcesso } from "@/components/moldura-acesso";

export const metadata = { title: "Nova senha" };

export default async function PaginaRedefinirSenha({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <MolduraAcesso>
      <FormularioRedefinirSenha token={token} />
    </MolduraAcesso>
  );
}
