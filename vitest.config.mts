import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O tsconfig deixa jsx em preserve para o Next. O Vitest precisa transformar o JSX dos componentes.
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
