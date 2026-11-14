import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_PRODUTO } from "@/lib/marca";
import { podeConfigurarAsaas, podeVerAssessor, podeVerFaturas, podeVerMensagens, podeVerMetricas, podeVerRegua, podeVerResultado } from "@/lib/permissoes";
import { COOKIE_SESSAO } from "@/server/auth/constantes";
import { verificarToken } from "@/server/auth/token";

function destinoSeguro(valor: string | null): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//")) return "/";
  return valor;
}

function paginaProibida(pathname: string, titulo: string, texto: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: texto, codigo: "sem_permissao" }, { status: 403 });
  }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acesso negado · ${NOME_PRODUTO}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#051a3a;font-family:Outfit,ui-sans-serif,system-ui,sans-serif"><main style="max-width:36rem;padding:2rem"><p style="letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;color:#6b4e0e">Acesso negado</p><h1 style="font-size:2.5rem;font-weight:500">${titulo}</h1><p style="color:#5a6b80">${texto}</p><p><a href="/" style="color:#36679d">Voltar ao painel</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function resultadoProibido(pathname: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { erro: "Só o dono da empresa pode ver o resultado.", codigo: "sem_permissao" },
      { status: 403 },
    );
  }
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acesso negado · ${NOME_PRODUTO}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#051a3a;font-family:Outfit,ui-sans-serif,system-ui,sans-serif"><main style="max-width:36rem;padding:2rem"><p style="letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;color:#6b4e0e">Acesso negado</p><h1 style="font-size:2.5rem;font-weight:500">Só o dono vê esta página</h1><p style="color:#5a6b80">O resultado de custo e faturamento fica com o dono da empresa. Financeiro e suporte não entram aqui.</p><p><a href="/" style="color:#36679d">Voltar ao painel</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarToken(token) : null;
  const autenticado = Boolean(sessao);
  const rotaPublica =
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/esqueci-senha" ||
    pathname === "/redefinir-senha" ||
    pathname === "/api/auth/entrar" ||
    pathname === "/api/auth/esqueci-senha" ||
    pathname === "/api/auth/redefinir-senha" ||
    pathname === "/api/cadastro" ||
    pathname === "/api/webhooks/asaas" ||
    pathname === "/api/webhooks/twilio" ||
    pathname.startsWith("/api/webhooks/inter/") ||
    pathname.startsWith("/api/webhooks/cora/") ||
    pathname === "/api/integracoes/cora/callback" ||
    pathname === "/api/cron/regua" ||
    pathname === "/api/cron/regua-emissao" ||
    pathname === "/api/cron/visualizacoes" ||
    pathname === "/api/cron/recorrencias" ||
    pathname === "/api/cron/conciliacao" ||
    pathname.startsWith("/api/publico/logos/") ||
    pathname.startsWith("/api/publico/pix/") ||
    pathname.startsWith("/pagar/");

  if (rotaPublica) {
    const empresaSuspensa = request.nextUrl.searchParams.get("motivo") === "suspensa";
    if (autenticado && pathname === "/login" && !empresaSuspensa) {
      return NextResponse.redirect(
        new URL(destinoSeguro(request.nextUrl.searchParams.get("next")), request.url),
      );
    }
    return NextResponse.next();
  }

  if (!autenticado || !sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const rotaResultado =
    pathname === "/resultado" ||
    pathname.startsWith("/resultado/") ||
    pathname === "/dashboards/resultado" ||
    pathname.startsWith("/dashboards/resultado/") ||
    pathname === "/api/resultado";
  if (rotaResultado && !podeVerResultado(sessao.papel)) {
    return resultadoProibido(pathname);
  }

  const rotaMetricas = pathname === "/dashboards/metricas" || pathname.startsWith("/dashboards/metricas/");
  if (rotaMetricas && !podeVerMetricas(sessao.papel)) {
    return paginaProibida(
      pathname,
      "Só o dono vê as métricas",
      "MRR, churn e LTV ficam com o dono da empresa. Financeiro e suporte não entram aqui.",
    );
  }

  const rotaPainelFinanceiro =
    pathname === "/painel-financeiro" ||
    pathname.startsWith("/painel-financeiro/") ||
    pathname === "/dashboards/financeiro" ||
    pathname.startsWith("/dashboards/financeiro/") ||
    pathname === "/api/painel-financeiro" ||
    pathname.startsWith("/api/painel-financeiro/");
  if (rotaPainelFinanceiro && !podeVerFaturas(sessao.papel)) {
    return paginaProibida(
      pathname,
      "O painel financeiro fica com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver o painel financeiro.",
    );
  }

  const rotaFaturas =
    pathname === "/faturas" ||
    pathname.startsWith("/faturas/") ||
    pathname === "/conciliacao" ||
    pathname.startsWith("/conciliacao/") ||
    pathname === "/api/faturas" ||
    pathname.startsWith("/api/faturas/") ||
    pathname.startsWith("/api/recorrencias") ||
    /^\/api\/clientes\/[^/]+\/faturas\/?$/.test(pathname) ||
    /^\/api\/servicos-cliente\/[^/]+\/(recorrencia|link-cartao)(\/|$)/.test(pathname);
  if (rotaFaturas && !podeVerFaturas(sessao.papel)) {
    return paginaProibida(
      pathname,
      "Faturas ficam com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver as faturas.",
    );
  }

  const rotaRegua =
    pathname === "/regua" ||
    pathname.startsWith("/regua/") ||
    pathname === "/api/regua" ||
    pathname.startsWith("/api/regua/") ||
    /^\/api\/clientes\/[^/]+\/regua\/?$/.test(pathname);
  if (rotaRegua && !podeVerRegua(sessao.papel)) {
    return paginaProibida(
      pathname,
      "A régua fica com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver a régua de cobrança.",
    );
  }

  const rotaMensagens =
    pathname === "/mensagens" ||
    pathname.startsWith("/mensagens/") ||
    pathname === "/api/mensagens" ||
    pathname.startsWith("/api/mensagens/");
  if (rotaMensagens && !podeVerMensagens(sessao.papel)) {
    return paginaProibida(
      pathname,
      "As mensagens ficam com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver o WhatsApp e o SMS enviados pela empresa.",
    );
  }

  const rotaAssessor =
    pathname === "/assessor" ||
    pathname.startsWith("/assessor/") ||
    pathname === "/api/assessor" ||
    pathname.startsWith("/api/assessor/");
  if (rotaAssessor && !podeVerAssessor(sessao.papel)) {
    return paginaProibida(
      pathname,
      "O assessor fica com o dono e o financeiro",
      "Só o dono ou o financeiro pode ver o assessor de cobrança.",
    );
  }

  const rotaAsaas =
    pathname === "/asaas" ||
    pathname.startsWith("/asaas/") ||
    pathname.startsWith("/api/asaas") ||
    pathname === "/banco" ||
    pathname.startsWith("/banco/") ||
    pathname.startsWith("/api/banco") ||
    pathname.startsWith("/api/integracoes/cora/");
  if (rotaAsaas && !podeConfigurarAsaas(sessao.papel)) {
    const banco =
      pathname === "/banco" ||
      pathname.startsWith("/banco/") ||
      pathname.startsWith("/api/banco") ||
      pathname.startsWith("/api/integracoes/cora/");
    return paginaProibida(
      pathname,
      banco ? "Só o dono configura o banco" : "Só o dono configura o Asaas",
      banco
        ? "Certificado, chave e segredos do banco ficam com o dono da empresa. Financeiro e suporte não entram aqui."
        : "A chave da API e o token do webhook ficam com o dono da empresa. Financeiro e suporte não entram aqui.",
    );
  }

  const rotaTelefones =
    pathname === "/telefones" ||
    pathname.startsWith("/telefones/") ||
    pathname === "/api/telefones" ||
    pathname.startsWith("/api/telefones/");
  if (rotaTelefones && sessao.papel !== "DONO") {
    return paginaProibida(
      pathname,
      "Só o dono cadastra os telefones",
      "A subconta Twilio e os números de WhatsApp e SMS ficam com o dono da empresa. Financeiro e suporte não entram aqui.",
    );
  }

  const rotaEmails =
    pathname === "/emails" ||
    pathname.startsWith("/emails/") ||
    pathname === "/api/empresa/logo";
  if (rotaEmails && sessao.papel !== "DONO") {
    return paginaProibida(
      pathname,
      "Só o dono personaliza os e-mails",
      "A logo e a prévia dos avisos ficam com o dono da empresa. Financeiro e suporte não entram aqui.",
    );
  }

  const rotaPlataforma =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin/empresas" ||
    pathname.startsWith("/api/admin/empresas/");
  if (rotaPlataforma && !sessao.superadministrador) {
    return paginaProibida(
      pathname,
      "Só a plataforma entra aqui",
      "Empresas e as ferramentas da Taguaro ficam com o superadministrador. O dono da empresa assinante não acessa esta área.",
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
