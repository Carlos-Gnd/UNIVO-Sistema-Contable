import { defineProject, mergeConfig } from "vitest/config";
import base from "../../vitest.shared.ts";

// Las pruebas comparten una base real: se ejecutan en serie.
export default mergeConfig(
  base,
  defineProject({ test: { name: "db", fileParallelism: false, testTimeout: 20000, hookTimeout: 60000 } }),
);
