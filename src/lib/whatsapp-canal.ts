export const NUMERO_OFICIAL_TAGUARO = "+1 650 476 2069";
export const NUMERO_SANDBOX_TWILIO = "+1 415 523 8886";

export type EntradaCanalWhatsapp = {
  modoTeste: boolean;
  remetenteOficialLigado: boolean;
  sandboxLigado: boolean;
  numeroTesteConfigurado: boolean;
  templatesContaPaiProntos: boolean;
  numeroEmpresaPronto: boolean;
};

export type DescricaoCanalWhatsapp = {
  selo: string;
  paragrafos: string[];
  notaNumeroProprio: string;
  usaNumeroEmpresa: boolean;
};

const NOTA_DEPOIS =
  "Conectar o número da empresa fica para depois. Enquanto o caminho acima for outro, a régua não depende desse número.";

const NOTA_EMPRESA =
  "Neste estado a régua usa o número conectado da empresa. O formulário abaixo é a configuração desse número.";

function destinoTeste(numeroTesteConfigurado: boolean): string {
  if (!numeroTesteConfigurado) {
    return "O modo teste está ligado, mas o servidor não tem número de teste. Nada é enviado.";
  }
  return "O modo teste está ligado: só o número de teste recebe. O cliente não recebe.";
}

// Espelha a fila: o número oficial da conta pai só entra com a flag e o modo teste.
// Fora do modo teste a flag não manda para o cliente.
export function descreverCanalWhatsapp(entrada: EntradaCanalWhatsapp): DescricaoCanalWhatsapp {
  const oficial = entrada.modoTeste && entrada.remetenteOficialLigado;
  const sandbox = entrada.modoTeste && entrada.sandboxLigado && !entrada.numeroEmpresaPronto && !oficial;

  if (oficial) {
    const paragrafos = [
      entrada.templatesContaPaiProntos
        ? `As mensagens saem do número oficial da Taguaro, ${NUMERO_OFICIAL_TAGUARO}, com os templates UTILITY da conta da Taguaro.`
        : `O número oficial da Taguaro (${NUMERO_OFICIAL_TAGUARO}) está ligado, mas falta template da conta pai. A mensagem fica na fila.`,
      destinoTeste(entrada.numeroTesteConfigurado),
    ];
    return { selo: "Sai pelo número da Taguaro", paragrafos, notaNumeroProprio: NOTA_DEPOIS, usaNumeroEmpresa: false };
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

  if (!entrada.modoTeste && entrada.numeroEmpresaPronto) {
    const paragrafos = [
      "O modo teste está desligado. O WhatsApp sai do número da empresa, para o cliente.",
    ];
    if (entrada.remetenteOficialLigado) {
      paragrafos.push(
        `O número oficial da Taguaro (${NUMERO_OFICIAL_TAGUARO}) não envia para o cliente. Ele só funciona com o modo teste ligado.`,
      );
    }
    return { selo: "Sai pelo número da empresa", paragrafos, notaNumeroProprio: NOTA_EMPRESA, usaNumeroEmpresa: true };
  }

  const paragrafos = ["Nenhum WhatsApp da régua sai neste estado."];
  if (entrada.remetenteOficialLigado && !entrada.modoTeste) {
    paragrafos.push(
      `O número oficial da Taguaro (${NUMERO_OFICIAL_TAGUARO}) só envia com o modo teste ligado. Desligado, ele não manda para o cliente.`,
    );
  } else if (entrada.modoTeste) {
    paragrafos.push("O modo teste está ligado, mas nem o número oficial nem o sandbox estão ativos no servidor.");
  } else {
    paragrafos.push("Sem o modo teste e sem número da empresa online, não há remetente.");
  }
  return { selo: "WhatsApp parado", paragrafos, notaNumeroProprio: NOTA_DEPOIS, usaNumeroEmpresa: false };
}
