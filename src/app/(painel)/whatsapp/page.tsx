import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioAtendimentoIa } from "@/components/formulario-atendimento-ia";
import { FormularioComprovantes } from "@/components/formulario-comprovantes";
import { PainelTelefones } from "@/components/painel-telefones";
import { descreverEnvioWhatsapp, montarEntradaExibicaoWhatsapp } from "@/lib/whatsapp-canal";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterPainelRegua } from "@/server/services/regua-service";
import { obterPainelTelefones } from "@/server/services/twilio-empresa-service";
import { obterAtendimentoIa } from "@/server/services/atendimento-ia-service";
import { leituraComprovantesDaEmpresa } from "@/server/services/comprovante-service";
import { obterWhatsappDaEmpresa } from "@/server/services/twilio-service";
import { rotaWhatsapp } from "@/server/twilio/sandbox";
import { redirect } from "next/navigation";

export const metadata = { title: "WhatsApp" };

export default async function PaginaWhatsapp() {
  const acesso = await acessoDaPagina();
  if (acesso.papel !== "DONO") redirect("/");
  const [painel, regua, whatsapp, atendimentoIa, comprovantes] = await Promise.all([
    obterPainelTelefones(acesso),
    obterPainelRegua(acesso),
    obterWhatsappDaEmpresa(acesso.empresaId),
    obterAtendimentoIa(acesso.empresaId),
    leituraComprovantesDaEmpresa(acesso.empresaId),
  ]);
  const padrao = painel.numeros.find(
    (numero) => numero.canal === "WHATSAPP" && numero.padrao && numero.status === "ATIVO",
  );
  const antigoPronto =
    whatsapp.senderStatus === "ONLINE" &&
    whatsapp.senderTelefone &&
    whatsapp.templates.some((item) => item.status === "APROVADO")
      ? whatsapp.senderTelefone
      : null;
  const rota = rotaWhatsapp({
    modoTeste: regua.config.modoTeste,
    oficialLigado: whatsapp.canal.remetenteOficialLigado,
    sandboxLigado: whatsapp.canal.sandboxLigado,
    empresaPronta: Boolean(antigoPronto),
    producaoLiberada: whatsapp.canal.producaoOficialLiberada,
  });
  const exibicao = descreverEnvioWhatsapp(
    montarEntradaExibicaoWhatsapp({
      envioEmpresa: painel.envioWhatsapp === "empresa",
      numeroPadraoAtivo: padrao?.telefoneE164 ?? null,
      temModeloAprovado: painel.templates.some((item) => item.status === "APROVADO"),
      rota,
      numeroAntigoPronto: antigoPronto,
    }),
  );

  return (
    <>
      <CabecalhoPagina
        olho="Configurações"
        titulo="WhatsApp"
        descricao="A conta de envio, os números e os modelos desta empresa. Cadastrar um número não compra linha e não envia mensagem."
      />
      <PainelTelefones
        inicial={painel}
        modoTeste={regua.config.modoTeste}
        statusEnvio={exibicao.titulo}
        complementoEnvio={exibicao.complemento}
      />
      <FormularioAtendimentoIa inicial={atendimentoIa} />
      <FormularioComprovantes ativo={comprovantes} />
    </>
  );
}
