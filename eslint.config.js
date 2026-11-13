import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

// Configuración única para todo el monorepo: apps/web, apps/api y packages/*.
// No crear eslint.config.js dentro de los paquetes; agregar aquí los bloques por carpeta.
export default tseslint.config(
  { ignores: ["**/dist/**", "**/build/**", "**/node_modules/**", "**/generated/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Los montos se manejan con decimal.js; prohibimos parseFloat para evitar errores de redondeo
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Usa Dinero (decimal.js) para montos." },
      ],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Interfaz (S1-T02): React con Vite en el navegador
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },
  {
    // API (S1-T03): NestJS en Node. Los decoradores y la inyección usan clases con propiedades de parámetro.
    files: ["apps/api/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: { "@typescript-eslint/no-extraneous-class": "off" },
  },
  {
    // Scripts de mantenimiento, semilla y archivos de configuración que corren directamente con Node
    files: ["**/scripts/**/*.{js,mjs}", "**/*.config.{js,mjs,ts}", "**/prisma/seed.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-console": "off" },
  },
  // Siempre al final: desactiva las reglas de estilo que resuelve Prettier
  prettier,
);
