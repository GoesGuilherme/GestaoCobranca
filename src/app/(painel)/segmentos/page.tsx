import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelSegmentos } from "@/components/painel-segmentos";
import { podeAlterarSegmentos } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { listarSegmentos } from "@/server/services/segmento-service";

export const metadata = { title: "Segmentos" };

export default async function PaginaSegmentos() {
  const acesso = await acessoDaPagina();
  const segmentos = await listarSegmentos(acesso.empresaId);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Segmentos"
        descricao="Tipos de cliente desta empresa. Quem tem clientes vinculados é desativado, não excluído."
      />
      <PainelSegmentos segmentos={segmentos} podeEditar={podeAlterarSegmentos(acesso.papel)} />
    </>
  );
}
