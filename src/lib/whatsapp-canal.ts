// Texto da tela de WhatsApp. A fila ainda distingue número da empresa, número
// da Taguaro, número antigo e número de teste. Aqui isso vira uma frase só.

export type RotaExibicaoWhatsapp = "oficial_teste" | "oficial_producao" | "sandbox" | "empresa" | "nenhuma";

export type EntradaExibicaoWhatsapp = {
  numeroEmpresaPronto: string | null;
  numeroEmpresaSemModelo: string | null;
  numeroAntigo: string | null;
  rota: RotaExibicaoWhatsapp;
};

export type ExibicaoWhatsapp = {
  titulo: string;
  complemento: string | null;
};

export const NOTA_MODO_TESTE_WHATSAPP =
  "O modo teste da régua está ligado. E-mail e WhatsApp não vão para o cliente.";

export function montarEntradaExibicaoWhatsapp(dados: {
  envioEmpresa: boolean;
  numeroPadraoAtivo: string | null;
  temModeloAprovado: boolean;
  rota: RotaExibicaoWhatsapp;
  numeroAntigoPronto: string | null;
}): EntradaExibicaoWhatsapp {
  const pronto = dados.envioEmpresa && dados.temModeloAprovado ? dados.numeroPadraoAtivo : null;
  const semModelo = dados.envioEmpresa && !dados.temModeloAprovado ? dados.numeroPadraoAtivo : null;
  return {
    numeroEmpresaPronto: pronto,
    numeroEmpresaSemModelo: semModelo,
    numeroAntigo: dados.rota === "empresa" ? dados.numeroAntigoPronto : null,
    rota: dados.rota,
  };
}

function complementoNumeroParado(numero: string | null) {
  if (!numero) return null;
  return `O número ${numero} está ativo, mas ainda não envia: falta um modelo aprovado.`;
}

export function descreverEnvioWhatsapp(entrada: EntradaExibicaoWhatsapp): ExibicaoWhatsapp {
  if (entrada.numeroEmpresaPronto) {
    return {
      titulo: `As mensagens saem do número ${entrada.numeroEmpresaPronto}.`,
      complemento: null,
    };
  }
  if (entrada.rota === "oficial_teste" || entrada.rota === "oficial_producao") {
    return {
      titulo: "As mensagens saem pelo número da Taguaro.",
      complemento: complementoNumeroParado(entrada.numeroEmpresaSemModelo),
    };
  }
  if (entrada.rota === "empresa" && entrada.numeroAntigo) {
    return {
      titulo: `As mensagens saem do número ${entrada.numeroAntigo}.`,
      complemento: complementoNumeroParado(entrada.numeroEmpresaSemModelo),
    };
  }
  if (entrada.rota === "sandbox") {
    return {
      titulo: "As mensagens saem por um número de teste.",
      complemento: "O cliente não recebe.",
    };
  }
  return {
    titulo: "Nenhuma mensagem de WhatsApp sai neste momento.",
    complemento: complementoNumeroParado(entrada.numeroEmpresaSemModelo),
  };
}
