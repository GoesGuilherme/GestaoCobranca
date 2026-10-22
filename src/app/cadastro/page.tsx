import { FormularioCadastro } from "@/components/formulario-cadastro";

export const metadata = { title: "Cadastrar empresa" };

export default function PaginaCadastro() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-12">
      <div className="w-full">
        <p className="mb-6 font-display text-3xl">Gestão Cobrança</p>
        <FormularioCadastro />
      </div>
    </main>
  );
}
