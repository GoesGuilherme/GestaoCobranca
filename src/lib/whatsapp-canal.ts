export const NUMERO_OFICIAL_TAGUARO = "+1 650 476 2069";
export const NUMERO_SANDBOX_TWILIO = "+1 415 523 8886";

export type EntradaCanalWhatsapp = {
  modoTeste: boolean;
  remetenteOficialLigado: boolean;
  sandboxLigado: boolean;
  numeroTesteConfigurado: boolean;
  templatesContaPaiProntos: boolean;
  numeroEmpresaPronto: boolean;
  producaoOficialLiberada: boolean;
};

export type DescricaoCanalWhatsapp = {
  selo: string;
  paragrafos: string[];
  notaNumeroProprio: string;
  usaNumeroEmpresa: boolean;
};

const NOTA_DEPOIS =
  "Conectar o número da empresa fica para depois, até a Taguaro ter mais assinantes. Enquanto isso, a régua usa o número compartilhado da Taguaro.";

const NOTA_EMPRESA =
  "Neste estado a régua usa o número conectado da empresa. O formulário abaixo é a configuração desse número.";

function destinoTeste(numeroTesteConfigurado: boolean): string {
  if (!numeroTesteConfigurado) {
    return "O modo teste está ligado, mas o servidor não tem número de teste. Nada é enviado.";
  }
  return "O modo teste está ligado: só o número de teste recebe. O cliente não recebe.";
}

function avisoSandbox(sandboxLigado: boolean): string | null {
  if (!sandboxLigado) return null;
  return "O sandbox da Twilio está ligado no servidor e só vale no modo teste. Ele não manda para o cliente.";
}

// Espelha a fila. O sandbox não sai do modo teste. Cliente real só entra com a data de liberação.
export function descreverCanalWhatsapp(entrada: EntradaCanalWhatsapp): DescricaoCanalWhatsapp {
  const oficialTeste = entrada.modoTeste && entrada.remetenteOficialLigado;
  const oficialProducao = !entrada.modoTeste && entrada.remetenteOficialLigado && entrada.producaoOficialLiberada;
  const sandbox = entrada.modoTeste && entrada.sandboxLigado && !entrada.numeroEmpresaPronto && !entrada.remetenteOficialLigado;

  if (oficialTeste || oficialProducao) {
    const paragrafos = [
      entrada.templatesContaPaiProntos
        ? `As mensagens saem do número oficial da Taguaro, ${NUMERO_OFICIAL_TAGUARO}, com os templates UTILITY aprovados da conta da Taguaro.`
        : `O número oficial da Taguaro (${NUMERO_OFICIAL_TAGUARO}) está ligado, mas falta template da conta pai. A mensagem fica na fila.`,
      oficialProducao
        ? "O modo teste está desligado: o WhatsApp do cliente desta cobrança recebe, se ele não pediu para parar. Cobrança anterior à liberação não entra."
        : destinoTeste(entrada.numeroTesteConfigurado),
    ];
    const aviso = avisoSandbox(entrada.sandboxLigado);
    if (aviso) paragrafos.push(aviso);
    return { selo: "Sai pelo número da Taguaro", paragrafos, notaNumeroProprio: NOTA_DEPOIS, usaNumeroEmpresa: false };
  }

  if (!entrada.modoTeste && entrada.remetenteOficialLigado && !entrada.producaoOficialLiberada) {
    const paragrafos = [
      `O número oficial da Taguaro (${NUMERO_OFICIAL_TAGUARO}) está ligado, mas o envio para clientes reais ainda não foi liberado.`,
      "Cobranças já emitidas e mensagens ignoradas não são reenviadas. Defina a data de liberação no servidor para começar só nas cobranças novas.",
    ];
    const aviso = avisoSandbox(entrada.sandboxLigado);
    if (aviso) paragrafos.push(aviso);
    return { selo: "WhatsApp parado", paragrafos, notaNumeroProprio: NOTA_DEPOIS, usaNumeroEmpresa: false };
  }

  if (sandbox) {
    return {
      selo: "Sai pelo sandbox",
      paragrafos: [
        `As mensagens saem do sandbox da Twilio, ${NUMERO_SANDBOX_TWILIO}. O número oficial da Taguaro não está ligado.`,
        destinoTeste(entrada.numeroTesteConfigurado),
      ],
      notaNumeroProprio: NOTA_DEPOIS,
      usaNumeroEmpresa: false,
    };
  }

  if (entrada.modoTeste && entrada.numeroEmpresaPronto) {
    return {
      selo: "Sai pelo número da empresa",
      paragrafos: [
        "O modo teste está ligado. O WhatsApp sai do número conectado da empresa, só para o número de teste.",
        "O número oficial da Taguaro não está ligado.",
      ],
      notaNumeroProprio: NOTA_EMPRESA,
      usaNumeroEmpresa: true,
    };
  }

  if (!entrada.modoTeste && entrada.numeroEmpresaPronto && !entrada.remetenteOficialLigado) {
    return {
      selo: "Sai pelo número da empresa",
      paragrafos: ["O modo teste está desligado. O WhatsApp sai do número da empresa, para o cliente."],
      notaNumeroProprio: NOTA_EMPRESA,
      usaNumeroEmpresa: true,
    };
  }

  const paragrafos = ["Nenhum WhatsApp da régua sai neste estado."];
  if (entrada.modoTeste) {
    paragrafos.push("O modo teste está ligado, mas nem o número oficial nem o sandbox estão ativos no servidor.");
  } else {
    paragrafos.push("Sem o modo teste e sem número da empresa online, não há remetente.");
  }
  const aviso = avisoSandbox(entrada.sandboxLigado);
  if (aviso) paragrafos.push(aviso);
  return { selo: "WhatsApp parado", paragrafos, notaNumeroProprio: NOTA_DEPOIS, usaNumeroEmpresa: false };
}
