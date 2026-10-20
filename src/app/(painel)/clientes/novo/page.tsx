import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";

export const metadata = { title: "Novo cliente" };

export default function PaginaNovoCliente() {
  return (
    <>
      <CabecalhoPagina
        olho="Novo grupo"
        titulo="Cadastrar cliente"
        descricao="O cliente corresponde ao grupo do PDVLegal. As filiais entram na página seguinte."
      />
      <FormularioCliente />
    </>
  );
}
