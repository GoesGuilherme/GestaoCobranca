export type ItemMenu = {
  href: string;
  rotulo: string;
};

export type GrupoMenu = {
  id: string;
  titulo: string;
  itens: ItemMenu[];
};

export type OpcoesMenu = {
  mostrarUsuarios: boolean;
  mostrarFaturas: boolean;
  mostrarRegua: boolean;
  mostrarAssessor: boolean;
  mostrarAsaas: boolean;
};

export function itemAtivo(pathname: string, hash: string, href: string) {
  const [caminho, ancora] = href.split("#");
  const noCaminho =
    caminho === "/dashboards/painel"
      ? pathname === "/" || pathname === "/dashboards" || pathname.startsWith("/dashboards/")
      : pathname === caminho || pathname.startsWith(`${caminho}/`);
  if (!noCaminho) return false;
  if (ancora) return hash === `#${ancora}`;
  if (caminho === "/regua") return hash !== "#whatsapp";
  return true;
}

export function montarGruposMenu(opcoes: OpcoesMenu): GrupoMenu[] {
  const { mostrarUsuarios, mostrarFaturas, mostrarRegua, mostrarAssessor, mostrarAsaas } = opcoes;

  return [
    {
      id: "visao",
      titulo: "Visão geral",
      // Um item só. O grupo continua para o menu começar fechado e o destaque
      // do grupo atual cobrir as abas do Dashboard, inclusive Financeiro.
      itens: [{ href: "/dashboards/painel", rotulo: "Dashboards" }],
    },
    {
      id: "cobranca",
      titulo: "Cobrança",
      itens: [
        ...(mostrarFaturas ? [{ href: "/faturas", rotulo: "Faturas" }] : []),
        ...(mostrarFaturas ? [{ href: "/promessas", rotulo: "Promessas" }] : []),
        ...(mostrarRegua ? [{ href: "/regua", rotulo: "Régua de cobrança" }] : []),
        ...(mostrarAssessor ? [{ href: "/assessor", rotulo: "Assessor" }] : []),
      ],
    },
    {
      id: "cadastros",
      titulo: "Cadastros",
      itens: [
        { href: "/clientes", rotulo: "Clientes" },
        { href: "/segmentos", rotulo: "Segmentos" },
        { href: "/servicos", rotulo: "Serviços" },
      ],
    },
    {
      id: "configuracoes",
      titulo: "Configurações",
      itens: [
        ...(mostrarUsuarios ? [{ href: "/empresa", rotulo: "Empresa" }] : []),
        ...(mostrarUsuarios ? [{ href: "/emails", rotulo: "E-mails" }] : []),
        ...(mostrarAsaas ? [{ href: "/banco", rotulo: "Banco" }] : []),
        ...(mostrarAsaas ? [{ href: "/asaas", rotulo: "Asaas" }] : []),
        ...(mostrarRegua ? [{ href: "/regua#whatsapp", rotulo: "WhatsApp" }] : []),
        ...(mostrarUsuarios ? [{ href: "/usuarios", rotulo: "Usuários" }] : []),
      ],
    },
  ].filter((grupo) => grupo.itens.length > 0);
}

export function idGrupoAtual(pathname: string, hash: string, grupos: GrupoMenu[]) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "plataforma";
  return grupos.find((grupo) => grupo.itens.some((item) => itemAtivo(pathname, hash, item.href)))?.id;
}
