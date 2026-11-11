import { defineConfig } from "vitest/config";

// Las pruebas comparten una base real: se ejecutan en serie.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20000, hookTimeout: 60000 } });
