import { redirect } from "next/navigation";

// O login continua caindo em `/`. A visão geral mora na aba Painel.
export default function PaginaInicial() {
  redirect("/dashboards/painel");
}
