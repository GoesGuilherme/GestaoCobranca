import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";
import { acessoDaPagina } from "@/server/auth/pagina";

export const metadata = { title: "Novo cliente" };

export default async function PaginaNovoCliente() {
  const acesso = await acessoDaPagina();
  return (
    <>
      <CabecalhoPagina
        olho="Novo cliente"
        titulo="Cadastrar cliente"
        descricao="O cliente é quem esta empresa atende. As unidades entram na página seguinte."
      />
      <FormularioCliente podeBloquear={acesso.papel === "DONO"} />
    </>
  );
}
