export class ErroAplicacao extends Error {
  status: number;
  codigo: string;
  campos?: Record<string, string>;

  constructor(
    message: string,
    status = 400,
    codigo = "erro",
    campos?: Record<string, string>,
  ) {
    super(message);
    this.name = "ErroAplicacao";
    this.status = status;
    this.codigo = codigo;
    this.campos = campos;
  }
}
