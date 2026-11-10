import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O tsconfig do Next deixa jsx em "preserve". O Vitest precisa transformar o JSX para renderizar componentes.
  oxc: {
    jsx: "react-jsx",
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
