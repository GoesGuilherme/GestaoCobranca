import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCliente } from "@/components/formulario-cliente";
import { Trilha } from "@/components/trilha";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarSegmentos } from "@/server/services/segmento-service";

export const metadata = { title: "Novo cliente" };

export default async function PaginaNovoCliente() {
  const acesso = await acessoDaPagina();
  const segmentos = await listarSegmentos(acesso.empresaId);
  return (
    <>
      <Trilha itens={[{ href: "/clientes", rotulo: "Clientes" }, { rotulo: "Novo cliente" }]} />
      <CabecalhoPagina
        olho="Novo cliente"
        titulo="Cadastrar cliente"
        descricao="O cliente é quem esta empresa atende. As unidades entram na página seguinte."
      />
      <FormularioCliente podeBloquear={acesso.papel === "DONO"} segmentos={segmentos} />
    </>
  );
}
