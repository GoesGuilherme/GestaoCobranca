import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioAsaas } from "@/components/formulario-asaas";
import { FormularioPreferenciasCobranca } from "@/components/formulario-preferencias-cobranca";
import { podeConfigurarAsaas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterConfiguracaoAsaas } from "@/server/services/asaas-config-service";
import { obterPreferenciasCobranca } from "@/server/services/preferencia-cobranca-service";

export const metadata = { title: "Asaas" };

export default async function PaginaAsaas() {
  const acesso = await acessoDaPagina();
  if (!podeConfigurarAsaas(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="Só o dono configura o Asaas"
        descricao="A chave da API e o token do webhook ficam com o dono da empresa."
      />
    );
  }
  const [configuracao, preferencias] = await Promise.all([
    obterConfiguracaoAsaas(acesso),
    obterPreferenciasCobranca(acesso.empresaId),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Asaas"
        descricao="Cada empresa usa a própria conta e as próprias preferências de cobrança. A chave da API fica cifrada no banco com a ASAAS_ENCRYPTION_KEY do servidor. A tela mostra só os quatro últimos caracteres."
      />
      <FormularioAsaas inicial={configuracao} />
      <FormularioPreferenciasCobranca inicial={preferencias} />
    </>
  );
}
