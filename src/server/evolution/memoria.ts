import type { ClienteEvolution, EstadoEvolution, QrEvolution } from "./contrato";
import { qrConfiavel } from "./qr";

const QR_TESTE = qrConfiavel(
  `data:image/png;base64,${"A".repeat(80)}`,
);

type Instancia = { estado: EstadoEvolution; qr: QrEvolution | null };

export type ClienteEvolutionMemoria = ClienteEvolution & {
  chamouRede: boolean;
  enviados: { nome: string; numero: string; texto: string; id: string }[];
  simular(nome: string, estado: EstadoEvolution): void;
};

export function criarClienteEvolutionMemoria(): ClienteEvolutionMemoria {
  const instancias = new Map<string, Instancia>();
  const enviados: ClienteEvolutionMemoria["enviados"] = [];
  let sequencia = 0;

  function pegar(nome: string): Instancia {
    const atual = instancias.get(nome);
    if (atual) return atual;
    const criada = { estado: "DESCONECTADO" as const, qr: null };
    instancias.set(nome, criada);
    return criada;
  }

  return {
    chamouRede: false,
    enviados,
    simular(nome, estado) {
      pegar(nome).estado = estado;
    },
    async garantirInstancia(nome) {
      const instancia = pegar(nome);
      instancia.estado = "CONECTANDO";
      instancia.qr = QR_TESTE ? { imagem: QR_TESTE } : null;
      return instancia.qr;
    },
    async conectar(nome) {
      const instancia = pegar(nome);
      instancia.estado = "CONECTANDO";
      instancia.qr = QR_TESTE ? { imagem: QR_TESTE } : null;
      return instancia.qr;
    },
    async estado(nome) {
      return pegar(nome).estado;
    },
    async desconectar(nome) {
      const instancia = pegar(nome);
      instancia.estado = "DESCONECTADO";
      instancia.qr = null;
    },
    async enviarTexto(nome, numero, texto) {
      sequencia += 1;
      const id = `EVOTEST${String(sequencia).padStart(8, "0")}`;
      enviados.push({ nome, numero, texto, id });
      return { id };
    },
  };
}
