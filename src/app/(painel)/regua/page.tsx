import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelRegua } from "@/components/painel-regua";
import { podeConfigurarRegua, podeVerRegua } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterPainelRegua } from "@/server/services/regua-service";

export const metadata = { title: "Régua de cobrança" };

export default async function PaginaRegua() {
  const acesso = await acessoDaPagina();
  if (!podeVerRegua(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="A régua fica com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode ver a régua de cobrança."
      />
    );
  }
  const painel = await obterPainelRegua(acesso);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Régua de cobrança"
        descricao="Cada empresa monta as próprias réguas. O cliente pode usar a padrão, outra régua, nenhuma, ou ficar pausado. O e-mail sai pela Resend da empresa. WhatsApp fica para depois."
      />
      <PainelRegua
        podeEditar={podeConfigurarRegua(acesso.papel)}
        nomeEmpresa={acesso.nomeEmpresa}
        config={painel.config}
        reguas={painel.reguas}
      />
    </>
  );
}
