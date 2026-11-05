export class ErroEvolution extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "ErroEvolution";
    this.status = status;
  }
}

export type EstadoEvolution = "DESCONECTADO" | "CONECTANDO" | "CONECTADO" | "ERRO";

export type QrEvolution = {
  imagem: string;
};

export type ClienteEvolution = {
  garantirInstancia(nome: string, webhookUrl: string, segredoWebhook: string): Promise<QrEvolution | null>;
  conectar(nome: string): Promise<QrEvolution | null>;
  estado(nome: string): Promise<EstadoEvolution>;
  desconectar(nome: string): Promise<void>;
  enviarTexto(nome: string, numero: string, texto: string): Promise<{ id: string }>;
};
