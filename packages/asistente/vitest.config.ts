import { defineProject, mergeConfig } from "vitest/config";
import base from "../../vitest.shared.ts";

export default mergeConfig(base, defineProject({ test: { name: "asistente" } }));
