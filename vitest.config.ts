import { defineConfig } from "vitest/config";

// Ejecución conjunta desde la raíz (pnpm test:coverage, pnpm test:watch). Cada paquete con su
// vitest.config.ts es un proyecto; pnpm test sigue corriendo cada paquete por separado.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
    coverage: {
      provider: "v8",
      include: ["**/src/**/*.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/generated/**", "**/*.test.{ts,tsx}", "**/*.d.ts"],
      reporter: ["text", "html"],
    },
  },
});
