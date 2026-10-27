import type { MetadataRoute } from "next";
import { NOME_PRODUTO } from "@/lib/marca";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOME_PRODUTO,
    short_name: NOME_PRODUTO,
    start_url: "/",
    display: "standalone",
    background_color: "#F4F7FB",
    theme_color: "#051A3A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
