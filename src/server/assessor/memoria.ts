import type { ProvedorAssessor } from "./provedor";
import { redigirComFerramentas } from "./redigir";

// Fora de produção o assessor não chama o AI Gateway.
export function criarProvedorAssessorMemoria(): ProvedorAssessor {
  return {
    async gerar(entrada) {
      const resultado = await redigirComFerramentas(entrada.textoUsuario, entrada.ferramentas);
      return { texto: resultado.texto, tokens: 48 };
    },
  };
}
