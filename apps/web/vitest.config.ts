import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineProject, mergeConfig } from "vitest/config";
import base from "../../vitest.shared.ts";

// Pruebas de componentes con jsdom y Testing Library; el alias @ es el mismo de vite.config.ts
export default mergeConfig(
  base,
  defineProject({
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: { __APP_VERSION__: JSON.stringify("pruebas") },
    test: {
      name: "web",
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // jsdom con varios archivos en paralelo es lento; 5 s (el valor por defecto) fallaba al azar bajo carga
      testTimeout: 15_000,
    },
  }),
);
