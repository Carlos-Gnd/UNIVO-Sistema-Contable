import { defineConfig } from "tsdown";

// La API se empaqueta en un solo módulo ESM junto con los paquetes del monorepo (@contable/*), que se
// publican como TypeScript sin compilar. oxc emite los metadatos de decoradores que necesita la
// inyección de dependencias de Nest. Las dependencias de npm quedan externas y se cargan de node_modules.
export default defineConfig({
  entry: ["src/main.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  deps: { alwaysBundle: [/^@contable\//] },
  dts: false,
  sourcemap: true,
});
