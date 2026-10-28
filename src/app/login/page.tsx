import { Suspense } from "react";
import { FormularioLogin } from "@/components/formulario-login";
import { MolduraAcesso } from "@/components/moldura-acesso";

export const metadata = { title: "Entrar" };

export default function PaginaLogin() {
  return (
    <MolduraAcesso>
      <Suspense fallback={<p className="text-muted">Carregando...</p>}>
        <FormularioLogin mostrarExemplo={process.env.NODE_ENV !== "production"} />
      </Suspense>
    </MolduraAcesso>
  );
}
