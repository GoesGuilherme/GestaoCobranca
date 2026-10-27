import { FormularioCadastro } from "@/components/formulario-cadastro";
import { LogoTaguaro } from "@/components/logo-taguaro";

export const metadata = { title: "Cadastrar empresa" };

export default function PaginaCadastro() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-12">
      <div className="w-full">
        <p className="mb-6">
          <LogoTaguaro tom="claro" />
        </p>
        <FormularioCadastro />
      </div>
    </main>
  );
}
