import { defineProject, mergeConfig } from "vitest/config";
import base from "../../vitest.shared.ts";

/**
 * Las pruebas de test/ corren contra PostgreSQL, todas a la vez y cada una con su propia base. Con la
 * máquina cargada (en CI, o cuando varios archivos cargan el caso CheroPhonex al mismo tiempo) una prueba
 * de concurrencia que tarda ~2 s sola puede pasar de los 5 s por defecto de Vitest sin que nada esté mal.
 * Un límite holgado evita esos falsos fallos; una prueba que se cuelga de verdad sigue fallando.
 */
export default mergeConfig(
  base,
  defineProject({ test: { name: "api", testTimeout: 30_000, hookTimeout: 60_000 } }),
);
