import type { Acesso } from "@/server/auth/acesso";
import { exigirBanco } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import {
  ambienteGravadoCora,
  baseCora,
  redirectCora,
  urlWebhookCora,
} from "@/server/cora/ambiente";
import { salvarTokensEmpresa, tokenAplicacaoCora } from "@/server/cora/conta";
import {
  COOKIE_OAUTH_CORA,
  assinarEstadoOauth,
  estadosIguais,
  expiraEstadoOauth,
  hashEstadoOauth,
  lerEstadoOauth,
  novoEstadoOauth,
} from "@/server/cora/estado";
import { registrarWebhooksCora, transporteHttpsCora, trocarCodigoCora, urlAutorizacaoCora } from "@/server/cora/http";
import type { TransporteCora } from "@/server/cora/contrato";
import { logCora, logCoraErro } from "@/server/cora/log";

export { COOKIE_OAUTH_CORA };

export function opcoesCookieOauth(valor: string, maxAge = 10 * 60) {
  return {
    name: COOKIE_OAUTH_CORA,
    value: valor,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function iniciarOauthCora(acesso: Acesso): Promise<{ url: string; cookie: string }> {
  exigirBanco(acesso);
  redirectCora();
  const estado = novoEstadoOauth();
  await prisma.estadoOauth.deleteMany({
    where: { empresaId: acesso.empresaId, usuarioId: acesso.usuarioId, provedor: "CORA", expiraEm: { lt: new Date() } },
  });
  await prisma.estadoOauth.create({
    data: {
      empresaId: acesso.empresaId,
      usuarioId: acesso.usuarioId,
      provedor: "CORA",
      estadoHash: hashEstadoOauth(estado),
      expiraEm: expiraEstadoOauth(),
    },
  });
  const cookie = await assinarEstadoOauth({ estado, empresaId: acesso.empresaId, usuarioId: acesso.usuarioId });
  return { url: urlAutorizacaoCora(estado), cookie };
}

export async function concluirOauthCora(dados: {
  acesso: Acesso;
  code: string | null;
  state: string | null;
  cookie: string | null;
  transporte?: TransporteCora;
}): Promise<{ webhook: "ok" | "pendente" }> {
  exigirBanco(dados.acesso);
  const assinado = await lerEstadoOauth(dados.cookie);
  const state = dados.state?.trim() ?? "";
  const code = dados.code?.trim() ?? "";
  // A Cora documenta o retorno como code + session_state e não ecoa state.
  // Se state vier, tem de ser o do cookie. Se não vier, o cookie assinado que bate com o hash confirma.
  if (!assinado || !code || (state.length > 0 && !estadosIguais(state, assinado.estado))) {
    throw new ErroAplicacao("Não foi possível confirmar a conexão com a Cora.", 400, "cora_oauth");
  }
  if (assinado.empresaId !== dados.acesso.empresaId || assinado.usuarioId !== dados.acesso.usuarioId) {
    throw new ErroAplicacao("Não foi possível confirmar a conexão com a Cora.", 403, "cora_oauth");
  }
  const consumido = await prisma.estadoOauth.deleteMany({
    where: {
      estadoHash: hashEstadoOauth(assinado.estado),
      empresaId: dados.acesso.empresaId,
      usuarioId: dados.acesso.usuarioId,
      provedor: "CORA",
      expiraEm: { gt: new Date() },
    },
  });
  if (consumido.count !== 1) {
    throw new ErroAplicacao("Esta conexão com a Cora já foi usada ou expirou.", 400, "cora_oauth");
  }

  const transporte = dados.transporte ?? transporteHttpsCora();
  const tokens = await trocarCodigoCora(transporte, code);
  await salvarTokensEmpresa(dados.acesso.empresaId, tokens, ambienteGravadoCora());
  await prisma.empresa.update({ where: { id: dados.acesso.empresaId }, data: { provedorPagamento: "CORA" } });
  logCora("conta conectada", { empresaId: dados.acesso.empresaId, ambiente: ambienteGravadoCora(), base: baseCora() });

  const url = urlWebhookCora();
  if (!url) return { webhook: "pendente" };
  try {
    const token = await tokenAplicacaoCora(transporte);
    await registrarWebhooksCora(transporte, token, url);
    logCora("webhooks registrados", { empresaId: dados.acesso.empresaId });
    return { webhook: "ok" };
  } catch (erro) {
    logCoraErro("falha ao registrar webhook", {
      empresaId: dados.acesso.empresaId,
      codigo: erro instanceof ErroAplicacao ? erro.codigo : "erro",
    });
    return { webhook: "pendente" };
  }
}
