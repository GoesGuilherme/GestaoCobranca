import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioInter } from "@/components/formulario-inter";
import { FormularioPreferenciasCobranca } from "@/components/formulario-preferencias-cobranca";
import { podeConfigurarAsaas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterConfiguracaoInter } from "@/server/services/inter-config-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";

export const metadata = { title: "Banco" };

export default async function PaginaBanco() {
  const acesso = await acessoDaPagina();
  if (!podeConfigurarAsaas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Só o dono configura o banco"
        descricao="Certificado e segredos do Banco Inter ficam com o dono da empresa."
      />
    );
  }
  const [configuracao, preferencias] = await Promise.all([
    obterConfiguracaoInter(acesso),
    obterPreferenciasCobranca(acesso.empresaId),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Banco"
        descricao="O Inter emite boleto com Pix (Cobrança v3). O certificado e a chave ficam cifrados com a PAGAMENTOS_ENCRYPTION_KEY e não voltam para esta tela. Empresas no Asaas não mudam até alguém salvar o Inter aqui."
      />
      <FormularioInter inicial={configuracao} />
      <div className="mt-8">
        <FormularioPreferenciasCobranca inicial={preferencias} />
      </div>
    </>
  );
}
