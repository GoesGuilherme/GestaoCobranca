import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerCredenciaisPagamento, salvarCredenciaisPagamento, type AmbientePagamento } from "@/server/pagamentos/credenciais";
import { ambienteGravadoCora, baseCora } from "./ambiente";
import type { TokensCora, TransporteCora } from "./contrato";
import { renovarTokenCora, tokenParceiroCora } from "./http";
import { logCoraErro } from "./log";

const FOLGA_MS = 60_000;
const emCurso = new Map<string, Promise<string>>();
let parceiro: { token: string; expiraEm: number; base: string } | null = null;

export function limparCacheCora() {
  emCurso.clear();
  parceiro = null;
}

type Extra = Record<string, string>;

function extraDe(credenciais: { extra?: Extra } | undefined): Extra {
  return credenciais?.extra ?? {};
}

export async function salvarTokensEmpresa(
  empresaId: string,
  tokens: TokensCora,
  ambiente: AmbientePagamento = ambienteGravadoCora(),
) {
  if (!tokens.refreshToken) {
    throw new ErroAplicacao("A Cora não devolveu o refresh token. Conecte a conta de novo.", 502, "cora_auth");
  }
  await salvarCredenciaisPagamento({
    empresaId,
    provedor: "CORA",
    ambiente,
    credenciais: {
      extra: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        access_expira_em: String(tokens.expiraEm),
        escopos: "invoice",
      },
    },
  });
}

async function marcarReconectar(empresaId: string, ambiente: AmbientePagamento) {
  await salvarCredenciaisPagamento({
    empresaId,
    provedor: "CORA",
    ambiente,
    credenciais: { extra: { reconectar: "1", escopos: "invoice" } },
  });
}

async function resolverAccess(empresaId: string, transporte: TransporteCora, forcar: boolean): Promise<string> {
  const lido = await lerCredenciaisPagamento(empresaId, "CORA");
  const extra = extraDe(lido?.credenciais);
  const access = extra.access_token;
  const refresh = extra.refresh_token;
  const expira = Number(extra.access_expira_em ?? "0");
  if (!refresh) {
    throw new ErroAplicacao("Conecte a conta Cora desta empresa antes de emitir a cobrança.", 422, "cora_sem_conexao");
  }
  if (!forcar && access && Number.isFinite(expira) && expira - FOLGA_MS > Date.now()) return access;
  try {
    const novo = await renovarTokenCora(transporte, refresh);
    const refreshNovo = novo.refreshToken ?? refresh;
    await salvarTokensEmpresa(empresaId, { ...novo, refreshToken: refreshNovo }, lido?.ambiente ?? ambienteGravadoCora());
    return novo.accessToken;
  } catch (erro) {
    const codigo = erro instanceof ErroAplicacao ? erro.codigo : "erro";
    if (codigo === "cora_auth") {
      await marcarReconectar(empresaId, lido?.ambiente ?? ambienteGravadoCora());
      logCoraErro("refresh recusado", { empresaId });
      throw new ErroAplicacao("A conexão com a Cora expirou. Conecte a conta de novo.", 422, "cora_reconectar");
    }
    throw erro;
  }
}

export function accessTokenEmpresa(empresaId: string, transporte: TransporteCora, forcar = false): Promise<string> {
  const chave = `${empresaId}:${forcar ? "1" : "0"}`;
  const existente = emCurso.get(chave);
  if (existente) return existente;
  const promessa = resolverAccess(empresaId, transporte, forcar).finally(() => {
    emCurso.delete(chave);
  });
  emCurso.set(chave, promessa);
  return promessa;
}

export async function tokenAplicacaoCora(transporte: TransporteCora): Promise<string> {
  const base = baseCora();
  if (parceiro && parceiro.base === base && parceiro.expiraEm - FOLGA_MS > Date.now()) return parceiro.token;
  const tokens = await tokenParceiroCora(transporte);
  parceiro = { token: tokens.accessToken, expiraEm: tokens.expiraEm, base };
  return tokens.accessToken;
}

export async function conexaoCora(empresaId: string): Promise<{
  conectada: boolean;
  precisaReconectar: boolean;
  ambiente: AmbientePagamento | null;
  expiraEm: string | null;
} | null> {
  const lido = await lerCredenciaisPagamento(empresaId, "CORA");
  if (!lido) return null;
  const extra = extraDe(lido.credenciais);
  const expira = Number(extra.access_expira_em ?? "");
  return {
    conectada: Boolean(extra.access_token && extra.refresh_token),
    precisaReconectar: extra.reconectar === "1",
    ambiente: lido.ambiente,
    expiraEm: Number.isFinite(expira) && expira > 0 ? new Date(expira).toISOString() : null,
  };
}

export async function apagarConexaoCora(empresaId: string) {
  await prisma.configuracaoPagamento.deleteMany({ where: { empresaId, provedor: "CORA" } });
}
