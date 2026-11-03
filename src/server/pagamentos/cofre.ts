import { cifrarSegredoAsaas, decifrarSegredoAsaas, hashTokenWebhook } from "@/lib/asaas-cripto";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import type { ProvedorId } from "./contrato";

/**
 * Credencial de banco futuro. client_id, segredo e campos extras vão num JSON
 * cifrado. Certificado e chave privada ficam em colunas separadas, também
 * cifrados, para não viajarem junto do resto.
 *
 * Usa ASAAS_ENCRYPTION_KEY. Não há chave nova e esta não é rotacionada aqui.
 * O Asaas em produção continua em configuracoes_asaas; este cofre não copia
 * a chave que já está lá.
 */
export type CredenciaisProvedor = {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  certificadoPem?: string;
  chavePrivadaPem?: string;
  extras?: Record<string, string>;
};

export type PacoteCredenciais = {
  credenciaisCifradas: string;
  certificadoCifrado: string | null;
  chavePrivadaCifrada: string | null;
};

const CAMPOS = ["clientId", "clientSecret", "apiKey"] as const;

function texto(valor: string | undefined): string | null {
  const limpo = valor?.trim() ?? "";
  return limpo ? limpo : null;
}

export function cifrarCredenciais(credenciais: CredenciaisProvedor): PacoteCredenciais {
  const corpo: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const valor = texto(credenciais[campo]);
    if (valor) corpo[campo] = valor;
  }
  for (const [chave, valor] of Object.entries(credenciais.extras ?? {})) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(chave)) continue;
    const limpo = texto(valor);
    if (limpo) corpo[`extra_${chave}`] = limpo;
  }
  const certificado = texto(credenciais.certificadoPem);
  const chave = texto(credenciais.chavePrivadaPem);
  return {
    credenciaisCifradas: cifrarSegredoAsaas(JSON.stringify(corpo)),
    certificadoCifrado: certificado ? cifrarSegredoAsaas(certificado) : null,
    chavePrivadaCifrada: chave ? cifrarSegredoAsaas(chave) : null,
  };
}

export function decifrarCredenciais(pacote: PacoteCredenciais): CredenciaisProvedor {
  let corpo: unknown;
  try {
    corpo = JSON.parse(decifrarSegredoAsaas(pacote.credenciaisCifradas));
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    throw new ErroAplicacao("A credencial do provedor está ilegível.", 500, "provedor_ilegivel");
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new ErroAplicacao("A credencial do provedor está ilegível.", 500, "provedor_ilegivel");
  }
  const registro = corpo as Record<string, unknown>;
  const extras: Record<string, string> = {};
  const saida: CredenciaisProvedor = {};
  for (const [chave, valor] of Object.entries(registro)) {
    if (typeof valor !== "string") continue;
    if (chave === "clientId" || chave === "clientSecret" || chave === "apiKey") {
      saida[chave] = valor;
      continue;
    }
    if (chave.startsWith("extra_")) extras[chave.slice("extra_".length)] = valor;
  }
  if (Object.keys(extras).length > 0) saida.extras = extras;
  if (pacote.certificadoCifrado) saida.certificadoPem = decifrarSegredoAsaas(pacote.certificadoCifrado);
  if (pacote.chavePrivadaCifrada) saida.chavePrivadaPem = decifrarSegredoAsaas(pacote.chavePrivadaCifrada);
  return saida;
}

export async function salvarCredenciaisProvedor(dados: {
  empresaId: string;
  provedor: ProvedorId;
  ambiente: "SANDBOX" | "PRODUCAO";
  credenciais: CredenciaisProvedor;
  certificadoValidoAte?: Date | null;
  segredoWebhook?: string | null;
}) {
  if (dados.provedor === "ASAAS") {
    throw new ErroAplicacao(
      "A chave do Asaas continua na configuração que já existe. Este cofre é para os bancos seguintes.",
      409,
      "cofre_asaas",
    );
  }
  const pacote = cifrarCredenciais(dados.credenciais);
  const segredo = texto(dados.segredoWebhook ?? undefined);
  return prisma.configuracaoPagamento.upsert({
    where: { empresaId_provedor: { empresaId: dados.empresaId, provedor: dados.provedor } },
    create: {
      empresaId: dados.empresaId,
      provedor: dados.provedor,
      ambiente: dados.ambiente,
      ...pacote,
      certificadoValidoAte: dados.certificadoValidoAte ?? null,
      segredoWebhookCifrado: segredo ? cifrarSegredoAsaas(segredo) : null,
      segredoWebhookHash: segredo ? hashTokenWebhook(segredo) : null,
    },
    update: {
      ambiente: dados.ambiente,
      ...pacote,
      certificadoValidoAte: dados.certificadoValidoAte ?? null,
      ...(segredo
        ? { segredoWebhookCifrado: cifrarSegredoAsaas(segredo), segredoWebhookHash: hashTokenWebhook(segredo) }
        : {}),
    },
  });
}

export async function lerCredenciaisProvedor(empresaId: string, provedor: ProvedorId): Promise<CredenciaisProvedor | null> {
  const linha = await prisma.configuracaoPagamento.findUnique({
    where: { empresaId_provedor: { empresaId, provedor } },
  });
  if (!linha) return null;
  return decifrarCredenciais({
    credenciaisCifradas: linha.credenciaisCifradas,
    certificadoCifrado: linha.certificadoCifrado,
    chavePrivadaCifrada: linha.chavePrivadaCifrada,
  });
}
