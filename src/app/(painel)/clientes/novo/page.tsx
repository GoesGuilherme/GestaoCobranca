import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";

export const metadata = { title: "Novo cliente" };

export default function PaginaNovoCliente() {
  return (
    <>
      <CabecalhoPagina
        olho="Novo cliente"
        titulo="Cadastrar cliente"
        descricao="O cliente é quem esta empresa atende. As unidades entram na página seguinte."
      />
      <FormularioCliente />
    </>
  );
}
