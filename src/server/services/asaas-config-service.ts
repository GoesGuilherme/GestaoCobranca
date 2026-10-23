import {
  cifrarSegredoAsaas,
  decifrarSegredoAsaas,
  gerarTokenWebhook,
  hashTokenWebhook,
  mascararChave,
  ultimosDigitosChave,
} from "@/lib/asaas-cripto";
import type { ConfiguracaoAsaasDTO } from "@/lib/tipos";
import { esquemaConfiguracaoAsaas } from "@/lib/validacao";
import type { AutorEmpresa } from "@/server/auth/papeis";
import { exigirAsaas } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { lerEsquema } from "@/server/validar";
import { abrirClienteAsaas, traduzirErroAsaas } from "@/server/asaas/abrir";
import { mockAsaasLigado } from "@/server/asaas/fabrica";
import type { ClienteHttpAsaas } from "@/server/asaas/contrato";

type LinhaConfig = {
  ambiente: "SANDBOX" | "PRODUCAO";
  chaveApiUltimos4: string;
  tokenWebhookCifrado: string;
};

function montar(linha: LinhaConfig, tokenConhecido?: string | null): ConfiguracaoAsaasDTO {
  let tokenWebhook = tokenConhecido ?? null;
  let aviso: string | null = null;
  if (!tokenWebhook) {
    try {
      tokenWebhook = decifrarSegredoAsaas(linha.tokenWebhookCifrado);
    } catch {
      aviso = "Não foi possível ler o token do webhook. Confira a ASAAS_ENCRYPTION_KEY do servidor.";
    }
  }
  return {
    configurado: true,
    ambiente: linha.ambiente,
    chaveMascarada: mascararChave(linha.chaveApiUltimos4),
    tokenWebhook,
    simulado: mockAsaasLigado(),
    aviso,
  };
}

const vazia: ConfiguracaoAsaasDTO = {
  configurado: false,
  ambiente: null,
  chaveMascarada: null,
  tokenWebhook: null,
  simulado: mockAsaasLigado(),
  aviso: null,
};

export async function obterConfiguracaoAsaas(autor: AutorEmpresa): Promise<ConfiguracaoAsaasDTO> {
  exigirAsaas(autor);
  const linha = await prisma.configuracaoAsaas.findUnique({ where: { empresaId: autor.empresaId } });
  if (!linha) return { ...vazia, simulado: mockAsaasLigado() };
  return montar(linha);
}

export async function salvarConfiguracaoAsaas(
  autor: AutorEmpresa,
  entrada: unknown,
): Promise<ConfiguracaoAsaasDTO> {
  exigirAsaas(autor);
  const dados = lerEsquema(esquemaConfiguracaoAsaas, entrada);
  const atual = await prisma.configuracaoAsaas.findUnique({ where: { empresaId: autor.empresaId } });
  if (!atual && !dados.chaveApi) {
    throw new ErroAplicacao("Informe a chave da API do Asaas.", 400, "validacao", {
      chaveApi: "Informe a chave da API do Asaas.",
    });
  }

  const chaveApiCifrada = dados.chaveApi ? cifrarSegredoAsaas(dados.chaveApi) : atual!.chaveApiCifrada;
  const chaveApiUltimos4 = dados.chaveApi ? ultimosDigitosChave(dados.chaveApi) : atual!.chaveApiUltimos4;
  const tokenNovo = atual ? null : gerarTokenWebhook();
  const tokenWebhookCifrado = tokenNovo ? cifrarSegredoAsaas(tokenNovo) : atual!.tokenWebhookCifrado;
  const tokenWebhookHash = tokenNovo ? hashTokenWebhook(tokenNovo) : atual!.tokenWebhookHash;

  const gravada = await prisma.configuracaoAsaas.upsert({
    where: { empresaId: autor.empresaId },
    create: {
      empresaId: autor.empresaId,
      ambiente: dados.ambiente,
      chaveApiCifrada,
      chaveApiUltimos4,
      tokenWebhookCifrado,
      tokenWebhookHash,
    },
    update: {
      ambiente: dados.ambiente,
      chaveApiCifrada,
      chaveApiUltimos4,
    },
  });

  return montar(gravada, tokenNovo);
}

export async function regenerarTokenWebhookAsaas(autor: AutorEmpresa): Promise<ConfiguracaoAsaasDTO> {
  exigirAsaas(autor);
  const atual = await prisma.configuracaoAsaas.findUnique({ where: { empresaId: autor.empresaId } });
  if (!atual) {
    throw new ErroAplicacao("Configure o Asaas antes de gerar o token do webhook.", 409, "asaas_nao_configurado");
  }
  const token = gerarTokenWebhook();
  const gravada = await prisma.configuracaoAsaas.update({
    where: { empresaId: autor.empresaId },
    data: {
      tokenWebhookCifrado: cifrarSegredoAsaas(token),
      tokenWebhookHash: hashTokenWebhook(token),
    },
  });
  return montar(gravada, token);
}

export async function testarConexaoAsaas(
  autor: AutorEmpresa,
  clienteHttp?: ClienteHttpAsaas,
): Promise<{ conectado: true; conta: string }> {
  exigirAsaas(autor);
  try {
    const { http } = await abrirClienteAsaas(autor.empresaId, clienteHttp);
    const conta = await http.testarConexao();
    return { conectado: true, conta: conta.nome };
  } catch (erro) {
    traduzirErroAsaas(erro);
  }
}
