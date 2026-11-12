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
        descricao="A subconta, os números e os modelos de WhatsApp desta empresa. Cadastrar um número não compra linha e não envia mensagem. Sem subconta configurada e número ativo, o WhatsApp continua no número oficial."
      />
      <PainelTelefones inicial={painel} />
    </>
  );
}
