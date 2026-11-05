import type { NextConfig } from "next";
import { cabecalhosSeguranca } from "./src/server/seguranca/cabecalhos";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bcryptjs"],
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosSeguranca() }];
  },
  // forbidden() e unauthorized() só devolvem 403/401 com esta opção.
  experimental: {
    authInterrupts: true,
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
