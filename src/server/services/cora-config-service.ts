import type { ProvedorCodigo } from "@/lib/status-pagamento";
import { provedorCodigo } from "@/lib/status-pagamento";
import type { Acesso } from "@/server/auth/acesso";
import { exigirBanco } from "@/server/auth/papeis";
import { prisma } from "@/server/db";
import { ErroAplicacao } from "@/server/erros";
import { ambienteGravadoCora, parceiroCoraConfigurado, producaoCoraLigada, urlWebhookCora } from "@/server/cora/ambiente";
import { apagarConexaoCora, conexaoCora } from "@/server/cora/conta";
import type { ClienteHttpCora } from "@/server/cora/contrato";
import { provedorDaEmpresa } from "@/server/pagamentos/fabrica";

export type ConfiguracaoCoraDTO = {
  provedorAtual: ProvedorCodigo;
  conectada: boolean;
  precisaReconectar: boolean;
  ambiente: "STAGE" | "PRODUCAO";
  escopos: string;
  expiraEm: string | null;
  parceiroConfigurado: boolean;
  webhookConfigurado: boolean;
  aviso: string | null;
};

function ambienteTela(gravado: "SANDBOX" | "PRODUCAO" | null): "STAGE" | "PRODUCAO" {
  if (gravado === "PRODUCAO" || producaoCoraLigada()) return "PRODUCAO";
  return "STAGE";
}

export async function obterConfiguracaoCora(acesso: Acesso): Promise<ConfiguracaoCoraDTO> {
  exigirBanco(acesso);
  const empresa = await prisma.empresa.findUnique({
    where: { id: acesso.empresaId },
    select: { provedorPagamento: true },
  });
  let conexao: Awaited<ReturnType<typeof conexaoCora>> = null;
  let avisoChave: string | null = null;
  try {
    conexao = await conexaoCora(acesso.empresaId);
  } catch (erro) {
    if (erro instanceof ErroAplicacao && erro.codigo === "pagamentos_sem_chave") {
      avisoChave = "Defina PAGAMENTOS_ENCRYPTION_KEY para guardar a conexão da Cora.";
    } else {
      throw erro;
    }
  }
  const parceiro = parceiroCoraConfigurado();
  let aviso = avisoChave;
  if (!aviso && !parceiro) {
    aviso = "Defina CORA_CLIENT_ID e CORA_CLIENT_SECRET no ambiente de Preview para conectar uma conta.";
  } else if (!aviso && conexao?.precisaReconectar) {
    aviso = "A conexão com a Cora expirou. Conecte a conta de novo.";
  } else if (!aviso && !urlWebhookCora()) {
    aviso = "Defina CORA_WEBHOOK_SEGREDO (20 a 80 caracteres) para cadastrar o webhook de fatura.";
  }
  return {
    provedorAtual: provedorCodigo(empresa?.provedorPagamento),
    conectada: Boolean(conexao?.conectada),
    precisaReconectar: Boolean(conexao?.precisaReconectar),
    ambiente: ambienteTela(conexao?.ambiente ?? ambienteGravadoCora()),
    escopos: "invoice",
    expiraEm: conexao?.expiraEm ?? null,
    parceiroConfigurado: parceiro,
    webhookConfigurado: Boolean(urlWebhookCora()),
    aviso,
  };
}

export async function desconectarCora(acesso: Acesso): Promise<ConfiguracaoCoraDTO> {
  exigirBanco(acesso);
  await apagarConexaoCora(acesso.empresaId);
  await prisma.empresa.updateMany({
    where: { id: acesso.empresaId, provedorPagamento: "CORA" },
    data: { provedorPagamento: "ASAAS" },
  });
  return obterConfiguracaoCora(acesso);
}

export async function usarProvedorCora(acesso: Acesso, provedor: "CORA" | "ASAAS"): Promise<ConfiguracaoCoraDTO> {
  exigirBanco(acesso);
  if (provedor === "CORA") {
    const conexao = await conexaoCora(acesso.empresaId);
    if (!conexao?.conectada) {
      throw new ErroAplicacao("Conecte a conta Cora antes de usá-la nas cobranças.", 422, "cora_sem_conexao");
    }
  }
  await prisma.empresa.update({ where: { id: acesso.empresaId }, data: { provedorPagamento: provedor } });
  return obterConfiguracaoCora(acesso);
}

export async function testarConexaoCora(acesso: Acesso, clienteHttp?: ClienteHttpCora): Promise<{ conta: string }> {
  exigirBanco(acesso);
  const provedor = await provedorDaEmpresa(acesso.empresaId, undefined, undefined, clienteHttp);
  if (provedor.provedor !== "CORA") {
    throw new ErroAplicacao("A empresa não está usando a Cora.", 422, "provedor_indisponivel");
  }
  const conta = await provedor.testarConexao();
  return { conta: conta.titular };
}
