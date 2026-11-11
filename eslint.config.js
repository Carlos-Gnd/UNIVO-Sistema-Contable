import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/generated/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // Los montos se manejan con decimal.js; prohibimos parseFloat para evitar errores de redondeo
      "no-restricted-globals": [
        "error",
        { name: "parseFloat", message: "Usa Dinero (decimal.js) para montos." },
      ],
    },
  },
);
