import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bcryptjs"],
  // forbidden() e unauthorized() só devolvem 403/401 com esta opção.
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
