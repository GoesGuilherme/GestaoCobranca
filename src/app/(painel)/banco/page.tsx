import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioCora } from "@/components/formulario-cora";
import { FormularioInter } from "@/components/formulario-inter";
import { FormularioPreferenciasCobranca } from "@/components/formulario-preferencias-cobranca";
import { podeConfigurarAsaas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterConfiguracaoCora } from "@/server/services/cora-config-service";
import { obterConfiguracaoInter } from "@/server/services/inter-config-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";

export const metadata = { title: "Banco" };

export default async function PaginaBanco({ searchParams }: { searchParams: Promise<{ cora?: string }> }) {
  const acesso = await acessoDaPagina();
  if (!podeConfigurarAsaas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Só o dono configura o banco"
        descricao="A conexão com a Cora e o certificado do Banco Inter ficam com o dono da empresa."
      />
    );
  }
  const params = await searchParams;
  const [cora, configuracao, preferencias] = await Promise.all([
    obterConfiguracaoCora(acesso),
    obterConfiguracaoInter(acesso),
    obterPreferenciasCobranca(acesso.empresaId),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Banco"
        descricao="A Cora, em testes (Stage), e o Inter emitem boleto com Pix. Cada empresa escolhe o provedor das cobranças novas. Quem já usa Asaas ou Inter não muda até alguém trocar aqui. Os tokens da Cora e o certificado do Inter ficam cifrados e não voltam para esta tela."
      />
      <FormularioCora inicial={cora} retorno={params.cora ?? null} />
      <div className="mt-8">
        <FormularioInter inicial={configuracao} />
      </div>
      <div className="mt-8">
        <FormularioPreferenciasCobranca inicial={preferencias} />
      </div>
    </>
  );
}
