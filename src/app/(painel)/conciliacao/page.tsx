import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelConciliacaoOfx } from "@/components/painel-conciliacao-ofx";
import { podeVerFaturas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterPainelOfx } from "@/server/services/ofx-conciliacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conciliação OFX" };

export default async function PaginaConciliacao() {
  const acesso = await acessoDaPagina();
  if (!podeVerFaturas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="A conciliação fica com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode importar o extrato e baixar cobranças."
      />
    );
  }
  const painel = await obterPainelOfx(acesso);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Conciliação OFX"
        descricao="Importe o extrato da conta e o Taguaro baixa as cobranças Pix da empresa que estiverem em aberto ou vencidas. Valor e identificação únicos liquidam na hora. Na dúvida, a sugestão espera um clique."
      />
      <PainelConciliacaoOfx painel={painel} />
    </>
  );
}
