import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { NOME_PRODUTO } from "@/lib/marca";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: {
    default: NOME_PRODUTO,
    template: `%s · ${NOME_PRODUTO}`,
  },
  description: "Cadastro de clientes, filiais e serviços vendidos.",
  robots: { index: false, follow: false },
};

export default function LayoutRaiz({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
