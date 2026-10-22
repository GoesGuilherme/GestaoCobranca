import { redirect } from "next/navigation";
import { carregarAcesso, type Acesso } from "./acesso";

export async function acessoDaPagina(): Promise<Acesso> {
  const acesso = await carregarAcesso();
  if (acesso === "anonimo") redirect("/login");
  if (acesso === "suspensa") redirect("/login?motivo=suspensa");
  return acesso;
}
