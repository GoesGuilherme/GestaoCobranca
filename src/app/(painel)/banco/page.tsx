import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCora } from "@/components/formulario-cora";
import { FormularioInter } from "@/components/formulario-inter";
import { FormularioPixProprio } from "@/components/formulario-pix-proprio";
import { FormularioPreferenciasCobranca } from "@/components/formulario-preferencias-cobranca";
import { podeConfigurarAsaas, podeEmitirCobranca } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterConfiguracaoCora } from "@/server/services/cora-config-service";
import { obterConfiguracaoInter } from "@/server/services/inter-config-service";
import { obterConfiguracaoPix } from "@/server/services/pix-config-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";

export const metadata = { title: "Banco" };

export default async function PaginaBanco({ searchParams }: { searchParams: Promise<{ cora?: string }> }) {
  const acesso = await acessoDaPagina();
  const dono = podeConfigurarAsaas(acesso.papel);
  if (!podeEmitirCobranca(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Só o dono configura o banco"
        descricao="A conexão com a Cora, o certificado do Banco Inter e a chave Pix da empresa ficam com o dono ou o financeiro."
      />
    );
  }
  const params = await searchParams;
  const [cora, configuracao, preferencias, pix] = await Promise.all([
    dono ? obterConfiguracaoCora(acesso) : Promise.resolve(null),
    dono ? obterConfiguracaoInter(acesso) : Promise.resolve(null),
    dono ? obterPreferenciasCobranca(acesso.empresaId) : Promise.resolve(null),
    obterConfiguracaoPix(acesso),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Banco"
        descricao="A Cora, em testes (Stage), e o Inter emitem boleto com Pix. O Pix da empresa gera o QR na chave própria, sem banco intermediário. Cada empresa escolhe o provedor das cobranças novas. Os tokens da Cora e o certificado do Inter ficam cifrados e não voltam para esta tela."
      />
      {cora ? <FormularioCora inicial={cora} retorno={params.cora ?? null} /> : null}
      {configuracao ? (
        <div className="mt-8">
          <FormularioInter inicial={configuracao} />
        </div>
      ) : null}
      <div className="mt-8">
        <FormularioPixProprio inicial={pix} />
      </div>
      {preferencias ? (
        <div className="mt-8">
          <FormularioPreferenciasCobranca inicial={preferencias} />
        </div>
      ) : null}
    </>
  );
}
