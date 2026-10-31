export const TEXTO_FORA_DE_ESCOPO =
  "Eu só ajudo com a cobrança e o atendimento desta empresa: faturas, boletos e pagamentos. Não consigo tratar outro assunto por aqui.";

export const TEXTO_FALLBACK =
  "Não consegui consultar agora. Se quiser, peça para falar com uma pessoa da empresa.";

export const TEXTO_LIMITE =
  "Recebi muitas mensagens em pouco tempo. Espere alguns minutos e tente de novo, ou peça um atendente.";

export const TEXTO_TETO =
  "O limite de atendimento automático desta empresa, hoje, foi atingido. Uma pessoa da equipe pode continuar pelo Taguaro.";

export const TEXTO_JANELA =
  "A janela de 24 horas desta conversa encerrou. Fora dela não envio texto livre.";

export function textoRecusa(nomeEmpresa: string) {
  return `Eu sou o assessor de cobrança da ${nomeEmpresa} e só posso ajudar com faturas, boletos e pagamentos desta empresa. Para outro assunto, use o canal correspondente.`;
}

export function textoTecnico(nomeEmpresa: string) {
  return `Esse assunto fica com o atendimento humano da ${nomeEmpresa}. Registrei o pedido e uma pessoa da equipe continua por aqui. Eu não resolvo questão técnica pelo WhatsApp.`;
}

export function textoHumano(nomeEmpresa: string) {
  return `Vou chamar uma pessoa da ${nomeEmpresa} para continuar este atendimento. A equipe vê a conversa no Taguaro.`;
}

export function textoCumprimento(dados: { nomeAssessor: string; nomeEmpresa: string; nomeCliente: string | null }) {
  if (dados.nomeCliente) {
    return `Olá, ${dados.nomeCliente}. Eu sou ${dados.nomeAssessor}, da ${dados.nomeEmpresa}. Posso ajudar com faturas em aberto, boletos e pagamentos.`;
  }
  return `Olá. Eu sou ${dados.nomeAssessor}, assessor de cobrança da ${dados.nomeEmpresa}. Para consultar faturas, envie o CNPJ ou o CPF do cadastro. Sem isso, não mostro dados.`;
}

export function textoPedirDocumento(nomeEmpresa: string) {
  return `Não reconheci este WhatsApp no cadastro da ${nomeEmpresa}. Envie o CNPJ ou o CPF para eu conferir. Antes dessa conferência, não mostro fatura, boleto nem pagamento.`;
}

export function textoDocumentoInvalido(nomeEmpresa: string) {
  return `Não encontrei esse documento na ${nomeEmpresa}. Confira o CNPJ ou o CPF e envie de novo. Não mostro dados sem essa conferência.`;
}

export function textoDocumentoAmbiguo(nomeEmpresa: string) {
  return `Esse documento aparece em mais de um cadastro da ${nomeEmpresa}. Não vou mostrar dados. Uma pessoa da equipe pode continuar o atendimento.`;
}

export function textoIdentificado(nomeCliente: string, nomeEmpresa: string) {
  return `Encontrei o cadastro de ${nomeCliente} na ${nomeEmpresa}. Posso ajudar com faturas em aberto, boletos e pagamentos. O que você precisa?`;
}

export function textoForaDoHorario(dados: { nomeEmpresa: string; horaInicio: number; horaFim: number }) {
  return `O assessor da ${dados.nomeEmpresa} responde das ${dados.horaInicio}h às ${dados.horaFim}h, no horário de Brasília. Sua mensagem ficou registrada.`;
}

export function textoRetomada(nomeEmpresa: string) {
  return `Pronto. Você volta a poder falar com o assessor de cobrança da ${nomeEmpresa}. Se quiser, peça suas faturas ou o link do boleto.`;
}

export function textoModoTeste() {
  return "No modo teste o assessor só responde para o número configurado em TWILIO_WHATSAPP_TESTE.";
}
