import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelTelefones } from "@/components/painel-telefones";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterPainelTelefones } from "@/server/services/twilio-empresa-service";
import { redirect } from "next/navigation";

export const metadata = { title: "Telefones" };

export default async function PaginaTelefones() {
  const acesso = await acessoDaPagina();
  if (acesso.papel !== "DONO") redirect("/");
  const painel = await obterPainelTelefones(acesso);

  return (
    <>
      <CabecalhoPagina
        olho="Configurações"
        titulo="Telefones"
        descricao="A subconta e os números de WhatsApp e SMS desta empresa. Cadastrar um número não compra linha, não registra sender e não envia mensagem. Sem subconta configurada, o envio continua na conta global."
      />
      <PainelTelefones inicial={painel} />
    </>
  );
}
