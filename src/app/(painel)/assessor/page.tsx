import { CabecalhoPagina } from "@/components/cabecalho";
import { PainelAssessor } from "@/components/painel-assessor";
import { podeConfigurarAssessor, podeVerAssessor } from "@/lib/permissoes";
import { acessoDaPagina } from "@/server/auth/pagina";
import { obterAssessorDoPainel, obterConversa } from "@/server/services/assessor-service";

export const metadata = { title: "Assessor" };

type Busca = { conversa?: string };

export default async function PaginaAssessor({ searchParams }: { searchParams: Promise<Busca> }) {
  const params = await searchParams;
  const acesso = await acessoDaPagina();
  if (!podeVerAssessor(acesso.papel)) {
    return (
      <CabecalhoPagina
        olho="Acesso negado"
        titulo="O assessor fica com o dono e o financeiro"
        descricao="Só o dono ou o financeiro pode ver o assessor de cobrança."
      />
    );
  }
  const [painel, detalhe] = await Promise.all([
    obterAssessorDoPainel(acesso),
    params.conversa
      ? obterConversa(acesso, params.conversa).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <CabecalhoPagina
        olho={acesso.nomeEmpresa}
        titulo="Assessor"
        descricao="O cliente final fala com o WhatsApp da sua empresa. O assessor responde só sobre cobrança, dentro da janela de 24 horas, e passa assunto técnico para a equipe."
      />
      <PainelAssessor
        podeEditar={podeConfigurarAssessor(acesso.papel)}
        config={painel.config}
        conversas={painel.conversas}
        detalhe={detalhe}
      />
    </>
  );
}
