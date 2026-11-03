import { cifrarSegredoAsaas, decifrarSegredoAsaas, hashTokenWebhook } from "@/lib/asaas-cripto";
import type { ProvedorCodigo } from "@/lib/status-pagamento";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";

export type AmbientePagamento = "SANDBOX" | "PRODUCAO";

export type CredenciaisPagamento = {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  certificadoPem?: string;
  chavePrivadaPem?: string;
  extra?: Record<string, string>;
};

type PacoteCifrado = {
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  extra?: Record<string, string>;
};

const LIMITE = 16_000;

function textoOpcional(valor: string | undefined, nome: string): string | undefined {
  if (valor === undefined) return undefined;
  const limpo = valor.trim();
  if (!limpo) return undefined;
  if (limpo.length > LIMITE) {
    throw new ErroAplicacao(`O campo ${nome} passou do tamanho aceito.`, 400, "credencial_invalida");
  }
  return limpo;
}

function extraSeguro(extra: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!extra) return undefined;
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(extra)) {
    if (!/^[a-z0-9_]{1,40}$/.test(chave)) {
      throw new ErroAplicacao("Nome de credencial recusado.", 400, "credencial_invalida");
    }
    const limpo = textoOpcional(valor, chave);
    if (limpo) saida[chave] = limpo;
  }
  return Object.keys(saida).length > 0 ? saida : undefined;
}

function pacoteDe(credenciais: CredenciaisPagamento): PacoteCifrado {
  const pacote: PacoteCifrado = {
    clientId: textoOpcional(credenciais.clientId, "client_id"),
    clientSecret: textoOpcional(credenciais.clientSecret, "client_secret"),
    apiKey: textoOpcional(credenciais.apiKey, "api_key"),
    extra: extraSeguro(credenciais.extra),
  };
  if (!pacote.clientId && !pacote.clientSecret && !pacote.apiKey && !pacote.extra) {
    throw new ErroAplicacao("Informe ao menos uma credencial do provedor.", 400, "credencial_invalida");
  }
  return pacote;
}

function selar(pacote: PacoteCifrado): string {
  return cifrarSegredoAsaas(JSON.stringify(pacote));
}

function abrir(cifrado: string): PacoteCifrado {
  let json: unknown;
  try {
    json = JSON.parse(decifrarSegredoAsaas(cifrado));
  } catch (erro) {
    if (erro instanceof ErroAplicacao) throw erro;
    throw new ErroAplicacao("As credenciais do provedor estão ilegíveis.", 500, "credencial_ilegivel");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new ErroAplicacao("As credenciais do provedor estão ilegíveis.", 500, "credencial_ilegivel");
  }
  const corpo = json as Record<string, unknown>;
  const extraBruto = corpo.extra;
  let extra: Record<string, string> | undefined;
  if (extraBruto && typeof extraBruto === "object" && !Array.isArray(extraBruto)) {
    extra = {};
    for (const [chave, valor] of Object.entries(extraBruto)) {
      if (typeof valor === "string") extra[chave] = valor;
    }
  }
  return {
    clientId: typeof corpo.clientId === "string" ? corpo.clientId : undefined,
    clientSecret: typeof corpo.clientSecret === "string" ? corpo.clientSecret : undefined,
    apiKey: typeof corpo.apiKey === "string" ? corpo.apiKey : undefined,
    extra,
  };
}

export async function salvarCredenciaisPagamento(dados: {
  empresaId: string;
  provedor: ProvedorCodigo;
  ambiente: AmbientePagamento;
  credenciais: CredenciaisPagamento;
  segredoWebhook?: string | null;
  certificadoValidoAte?: Date | null;
}): Promise<void> {
  const pacote = pacoteDe(dados.credenciais);
  const certificado = textoOpcional(dados.credenciais.certificadoPem, "certificado");
  const chave = textoOpcional(dados.credenciais.chavePrivadaPem, "chave_privada");
  if (Boolean(certificado) !== Boolean(chave)) {
    throw new ErroAplicacao("Certificado e chave privada precisam ir juntos.", 400, "credencial_invalida");
  }
  const segredo =
    dados.segredoWebhook === undefined
      ? undefined
      : dados.segredoWebhook === null
        ? null
        : textoOpcional(dados.segredoWebhook, "segredo_webhook");
  await prisma.configuracaoPagamento.upsert({
    where: { empresaId_provedor: { empresaId: dados.empresaId, provedor: dados.provedor } },
    create: {
      empresaId: dados.empresaId,
      provedor: dados.provedor,
      ambiente: dados.ambiente,
      credenciaisCifradas: selar(pacote),
      certificadoCifrado: certificado ? cifrarSegredoAsaas(certificado) : null,
      chavePrivadaCifrada: chave ? cifrarSegredoAsaas(chave) : null,
      certificadoValidoAte: dados.certificadoValidoAte ?? null,
      segredoWebhookCifrado: segredo ? cifrarSegredoAsaas(segredo) : null,
      segredoWebhookHash: segredo ? hashTokenWebhook(segredo) : null,
    },
    update: {
      ambiente: dados.ambiente,
      credenciaisCifradas: selar(pacote),
      certificadoCifrado: certificado ? cifrarSegredoAsaas(certificado) : null,
      chavePrivadaCifrada: chave ? cifrarSegredoAsaas(chave) : null,
      certificadoValidoAte: dados.certificadoValidoAte ?? null,
      ...(segredo === undefined
        ? {}
        : {
            segredoWebhookCifrado: segredo ? cifrarSegredoAsaas(segredo) : null,
            segredoWebhookHash: segredo ? hashTokenWebhook(segredo) : null,
          }),
    },
  });
}

export async function lerCredenciaisPagamento(
  empresaId: string,
  provedor: ProvedorCodigo,
): Promise<{
  ambiente: AmbientePagamento;
  credenciais: CredenciaisPagamento;
  certificadoValidoAte: Date | null;
  temSegredoWebhook: boolean;
} | null> {
  const linha = await prisma.configuracaoPagamento.findUnique({
    where: { empresaId_provedor: { empresaId, provedor } },
  });
  if (!linha || !linha.ativo) return null;
  const pacote = abrir(linha.credenciaisCifradas);
  return {
    ambiente: linha.ambiente === "PRODUCAO" ? "PRODUCAO" : "SANDBOX",
    credenciais: {
      ...pacote,
      certificadoPem: linha.certificadoCifrado ? decifrarSegredoAsaas(linha.certificadoCifrado) : undefined,
      chavePrivadaPem: linha.chavePrivadaCifrada ? decifrarSegredoAsaas(linha.chavePrivadaCifrada) : undefined,
    },
    certificadoValidoAte: linha.certificadoValidoAte,
    temSegredoWebhook: Boolean(linha.segredoWebhookHash),
  };
}
