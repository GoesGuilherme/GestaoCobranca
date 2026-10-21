import "dotenv/config";
import { completarCnpj, completarCpf, identificarDocumento } from "../src/lib/documento";
import { prisma } from "../src/server/db";
import { gerarHashSenha } from "../src/server/auth/senha";
import { criarCliente } from "../src/server/services/cliente-service";
import { criarFilial } from "../src/server/services/filial-service";

type FilialExemplo = {
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  uf: string;
  status: "ATIVA" | "INATIVA" | "EM_IMPLANTACAO";
  observacoes?: string;
};

type ClienteExemplo = {
  nomeFantasia: string;
  razaoSocial: string;
  documento: string;
  segmento: "RESTAURANTE" | "MERCADO_AUTONOMO" | "OUTRO";
  contatoNome: string;
  whatsapp: string;
  email: string;
  cidade: string;
  uf: string;
  status: "ATIVO" | "INATIVO" | "EM_IMPLANTACAO";
  observacoes: string;
  filiais: FilialExemplo[];
};

const aviso = "Cadastro fictício de exemplo. Não é uma empresa real.";

const exemplos: ClienteExemplo[] = [
  {
    nomeFantasia: "Grupo Costa Verde Exemplo",
    razaoSocial: "Costa Verde Alimentos Exemplo Ltda",
    documento: completarCnpj("000000000001"),
    segmento: "RESTAURANTE",
    contatoNome: "Helena Costa Exemplo",
    whatsapp: "13900001001",
    email: "helena@costaverde.exemplo.test",
    cidade: "Praia Grande",
    uf: "SP",
    status: "ATIVO",
    observacoes: `${aviso} Grupo com várias filiais no litoral paulista.`,
    filiais: [
      {
        nome: "PRAIA GRANDE FOODTRUCK",
        cnpj: completarCnpj("100000000001"),
        endereco: "Av. Exemplo, 100 - Boqueirão",
        cidade: "Praia Grande",
        uf: "SP",
        status: "ATIVA",
        observacoes: "Nome idêntico ao cadastro no PDVLegal. Dado fictício de exemplo.",
      },
      {
        nome: "SANTOS CENTRO EXEMPLO",
        cnpj: completarCnpj("100000000002"),
        endereco: "Rua do Exemplo, 20 - Centro",
        cidade: "Santos",
        uf: "SP",
        status: "ATIVA",
      },
      {
        nome: "GUARUJA SHOPPING EXEMPLO",
        cnpj: completarCnpj("100000000003"),
        endereco: "Praça Exemplo, 15 - Enseada",
        cidade: "Guarujá",
        uf: "SP",
        status: "ATIVA",
      },
      {
        nome: "SAO VICENTE QUIOSQUE EXEMPLO",
        cnpj: completarCnpj("100000000004"),
        endereco: "Av. Exemplo, 400 - Gonzaguinha",
        cidade: "São Vicente",
        uf: "SP",
        status: "ATIVA",
      },
      {
        nome: "BERTIOGA ORLE EXEMPLO",
        cnpj: completarCnpj("100000000005"),
        endereco: "Rua da Praia Exemplo, 8 - Centro",
        cidade: "Bertioga",
        uf: "SP",
        status: "EM_IMPLANTACAO",
      },
      {
        nome: "CUBATAO DELIVERY EXEMPLO",
        cnpj: completarCnpj("100000000006"),
        endereco: "Av. Exemplo, 900 - Centro",
        cidade: "Cubatão",
        uf: "SP",
        status: "ATIVA",
      },
    ],
  },
  {
    nomeFantasia: "Mercado Autônomo Vila Nova Exemplo",
    razaoSocial: "Vila Nova Mercado Exemplo Ltda",
    documento: completarCnpj("000000000002"),
    segmento: "MERCADO_AUTONOMO",
    contatoNome: "Paulo Vila Exemplo",
    whatsapp: "19900002002",
    email: "paulo@vilanova.exemplo.test",
    cidade: "Campinas",
    uf: "SP",
    status: "ATIVO",
    observacoes: aviso,
    filiais: [
      {
        nome: "VILA NOVA LOJA 1 EXEMPLO",
        cnpj: completarCnpj("100000000007"),
        endereco: "Rua Exemplo, 50 - Vila Nova",
        cidade: "Campinas",
        uf: "SP",
        status: "ATIVA",
      },
      {
        nome: "VILA NOVA LOJA 2 EXEMPLO",
        cnpj: completarCnpj("100000000008"),
        endereco: "Av. Exemplo, 220 - Taquaral",
        cidade: "Campinas",
        uf: "SP",
        status: "ATIVA",
      },
    ],
  },
  {
    nomeFantasia: "Cantina da Nonna Exemplo",
    razaoSocial: "Cantina da Nonna Exemplo Ltda",
    documento: completarCnpj("000000000003"),
    segmento: "RESTAURANTE",
    contatoNome: "Lúcia Nonna Exemplo",
    whatsapp: "41900003003",
    email: "lucia@nonna.exemplo.test",
    cidade: "Curitiba",
    uf: "PR",
    status: "EM_IMPLANTACAO",
    observacoes: `${aviso} Implantação ainda em andamento.`,
    filiais: [
      {
        nome: "CANTINA BATEL EXEMPLO",
        cnpj: completarCnpj("100000000009"),
        endereco: "Alameda Exemplo, 70 - Batel",
        cidade: "Curitiba",
        uf: "PR",
        status: "EM_IMPLANTACAO",
      },
    ],
  },
  {
    nomeFantasia: "Hortifruti do Seu Zé Exemplo",
    razaoSocial: "Hortifruti Seu Zé Exemplo Ltda",
    documento: completarCnpj("000000000004"),
    segmento: "MERCADO_AUTONOMO",
    contatoNome: "José Horti Exemplo",
    whatsapp: "31900004004",
    email: "jose@horti.exemplo.test",
    cidade: "Belo Horizonte",
    uf: "MG",
    status: "INATIVO",
    observacoes: `${aviso} Cliente inativo de demonstração.`,
    filiais: [
      {
        nome: "HORTIFRUTI SAVASSI EXEMPLO",
        cnpj: completarCnpj("100000000010"),
        endereco: "Rua Exemplo, 12 - Savassi",
        cidade: "Belo Horizonte",
        uf: "MG",
        status: "INATIVA",
      },
    ],
  },
  {
    nomeFantasia: "Rede Bom Prato Exemplo",
    razaoSocial: "Bom Prato Restaurantes Exemplo Ltda",
    documento: completarCnpj("000000000005"),
    segmento: "RESTAURANTE",
    contatoNome: "Rita Prato Exemplo",
    whatsapp: "81900005005",
    email: "rita@bomprato.exemplo.test",
    cidade: "Recife",
    uf: "PE",
    status: "ATIVO",
    observacoes: aviso,
    filiais: [
      {
        nome: "BOM PRATO RECIFE ANTIGO EXEMPLO",
        cnpj: completarCnpj("100000000011"),
        endereco: "Rua do Bom Jesus Exemplo, 30",
        cidade: "Recife",
        uf: "PE",
        status: "ATIVA",
      },
      {
        nome: "BOM PRATO BOA VIAGEM EXEMPLO",
        cnpj: completarCnpj("100000000012"),
        endereco: "Av. Exemplo, 1500 - Boa Viagem",
        cidade: "Recife",
        uf: "PE",
        status: "ATIVA",
      },
      {
        nome: "BOM PRATO OLINDA EXEMPLO",
        cnpj: completarCnpj("100000000013"),
        endereco: "Ladeira Exemplo, 9 - Carmo",
        cidade: "Olinda",
        uf: "PE",
        status: "ATIVA",
      },
    ],
  },
  {
    nomeFantasia: "Mercado 24 Horas Centro Exemplo",
    razaoSocial: "Mercado 24 Horas Exemplo Ltda",
    documento: completarCnpj("000000000006"),
    segmento: "MERCADO_AUTONOMO",
    contatoNome: "Carlos Centro Exemplo",
    whatsapp: "51900006006",
    email: "carlos@24horas.exemplo.test",
    cidade: "Porto Alegre",
    uf: "RS",
    status: "ATIVO",
    observacoes: aviso,
    filiais: [
      {
        nome: "MERCADO 24H CENTRO EXEMPLO",
        cnpj: completarCnpj("100000000014"),
        endereco: "Av. Exemplo, 800 - Centro Histórico",
        cidade: "Porto Alegre",
        uf: "RS",
        status: "ATIVA",
      },
    ],
  },
  {
    nomeFantasia: "Padaria Estrela do Norte Exemplo",
    razaoSocial: "Padaria Estrela do Norte Exemplo Ltda",
    documento: completarCnpj("000000000007"),
    segmento: "OUTRO",
    contatoNome: "Irene Norte Exemplo",
    whatsapp: "92900007007",
    email: "irene@estrela.exemplo.test",
    cidade: "Manaus",
    uf: "AM",
    status: "EM_IMPLANTACAO",
    observacoes: aviso,
    filiais: [
      {
        nome: "PADARIA ADRIANOPOLIS EXEMPLO",
        cnpj: completarCnpj("100000000015"),
        endereco: "Rua Exemplo, 44 - Adrianópolis",
        cidade: "Manaus",
        uf: "AM",
        status: "EM_IMPLANTACAO",
      },
    ],
  },
  {
    nomeFantasia: "Lanchonete da Esquina Exemplo",
    razaoSocial: "Lanchonete da Esquina Exemplo Ltda",
    documento: completarCnpj("000000000008"),
    segmento: "RESTAURANTE",
    contatoNome: "Davi Esquina Exemplo",
    whatsapp: "71900008008",
    email: "davi@esquina.exemplo.test",
    cidade: "Salvador",
    uf: "BA",
    status: "INATIVO",
    observacoes: aviso,
    filiais: [
      {
        nome: "ESQUINA RIO VERMELHO EXEMPLO",
        cnpj: completarCnpj("100000000016"),
        endereco: "Rua Exemplo, 3 - Rio Vermelho",
        cidade: "Salvador",
        uf: "BA",
        status: "INATIVA",
      },
    ],
  },
  {
    nomeFantasia: "Maria das Areias Exemplo",
    razaoSocial: "Maria das Areias Exemplo",
    documento: completarCpf("000000001"),
    segmento: "OUTRO",
    contatoNome: "Maria das Areias Exemplo",
    whatsapp: "48900009009",
    email: "maria@areias.exemplo.test",
    cidade: "Florianópolis",
    uf: "SC",
    status: "ATIVO",
    observacoes: `${aviso} Pessoa física de demonstração, com CPF.`,
    filiais: [
      {
        nome: "QUIOSQUE DAS AREIAS EXEMPLO",
        cnpj: completarCnpj("000000000009"),
        endereco: "Av. Beira-Mar Exemplo, 10",
        cidade: "Florianópolis",
        uf: "SC",
        status: "ATIVA",
      },
    ],
  },
];

async function semearAcesso() {
  const email = (process.env.SEED_OWNER_EMAIL ?? "marina@exemplo.test").toLowerCase();
  const senha = process.env.SEED_OWNER_SENHA ?? "exemplo-1234";
  const nome = process.env.SEED_OWNER_NOME ?? "Marina Exemplo";
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (existente) {
    console.log(`Acesso já existia: ${email}`);
    return;
  }
  await prisma.usuario.create({
    data: { nome, email, senhaHash: await gerarHashSenha(senha) },
  });
  console.log(`Acesso de exemplo criado: ${email}`);
}

async function semearExemplos() {
  const ligar = process.env.SEED_EXEMPLOS
    ? process.env.SEED_EXEMPLOS === "true"
    : process.env.NODE_ENV !== "production";
  if (!ligar) {
    console.log("SEED_EXEMPLOS está desligado. Nenhum cliente fictício foi gravado.");
    return;
  }

  for (const exemplo of exemplos) {
    const documento = identificarDocumento(exemplo.documento);
    if (!documento) throw new Error(`Documento de exemplo inválido: ${exemplo.nomeFantasia}`);
    const jaExiste = await prisma.cliente.findUnique({ where: { documento: documento.normalizado } });
    if (jaExiste) {
      console.log(`Cliente de exemplo já existia: ${exemplo.nomeFantasia}`);
      continue;
    }
    const { filiais, ...dados } = exemplo;
    const cliente = await criarCliente(dados);
    for (const filial of filiais) {
      await criarFilial(cliente.id, filial);
    }
    const quantidade = filiais.length === 1 ? "1 filial" : `${filiais.length} filiais`;
    console.log(`Cliente de exemplo criado: ${exemplo.nomeFantasia} (${quantidade})`);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Este seed grava dados de exemplo e não roda em produção. Crie o acesso real com npm run criar-admin.",
    );
    process.exit(1);
  }
  await semearAcesso();
  await semearExemplos();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
