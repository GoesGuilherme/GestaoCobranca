import { FormularioEsqueciSenha } from "@/components/formulario-esqueci-senha";
import { MolduraAcesso } from "@/components/moldura-acesso";

export const metadata = { title: "Esqueci minha senha" };

export default function PaginaEsqueciSenha() {
  return (
    <MolduraAcesso>
      <FormularioEsqueciSenha />
    </MolduraAcesso>
  );
}
