import { CabecalhoPagina } from "@/components/cabecalho";
import { FormularioAsaas } from "@/components/formulario-asaas";
import { podeConfigurarAsaas } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterConfiguracaoAsaas } from "@/server/services/asaas-config-service";

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
  const configuracao = await obterConfiguracaoAsaas(acesso);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Asaas"
        descricao="Cada empresa usa a própria conta. A chave da API fica cifrada no banco com a ASAAS_ENCRYPTION_KEY do servidor. A tela mostra só os quatro últimos caracteres."
      />
      <FormularioAsaas inicial={configuracao} />
    </>
  );
}
