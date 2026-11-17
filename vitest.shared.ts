import { defineProject } from "vitest/config";

/**
 * Opciones de Vitest comunes a todos los paquetes. Cada paquete las extiende en su vitest.config.ts:
 *
 *   export default mergeConfig(base, defineProject({ test: { name: "shared" } }));
 *
 * - packages/* y apps/api: entorno "node" (el de esta base).
 * - apps/web: agregar `environment: "jsdom"` y la dependencia jsdom al crear la app (S1-T02).
 */
export default defineProject({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    // Cada prueba empieza sin espías ni variables de entorno simuladas de la anterior
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
