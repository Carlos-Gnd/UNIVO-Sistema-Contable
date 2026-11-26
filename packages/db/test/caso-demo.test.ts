import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { cargarCasoCherophonex, leerCaso } from "../src/casos/cherophonex";
import { reiniciarBaseDemo } from "../src/casos/reiniciar-demo";
import { basePropia, reiniciarBase } from "./helpers";

describe("historial de la empresa demo CheroPhonex", () => {
  let c: Awaited<ReturnType<typeof reiniciarBase>>;

  beforeAll(async () => {
    c = await reiniciarBase(await basePropia("contable_db_caso_demo"));
    await cargarCasoCherophonex(c, leerCaso(), { historialDemo: true });
  });

  afterAll(async () => {
    await c?.end();
  });

  it("prepara 24 meses de historial sin cambiar el tamaño del caso académico", async () => {
    const resultado = await c.query<{ meses: string; partidas: string; ejercicios: string }>(
      `select count(distinct to_char(fecha, 'YYYY-MM'))::text as meses,
              count(*)::text as partidas,
              (select count(*)::text from ejercicios) as ejercicios
       from partidas`,
    );

    expect(resultado.rows[0]).toEqual({ meses: "24", partidas: "136", ejercicios: "3" });
  });
});

describe("reinicio de base demo", () => {
  it("aplica y registra las migraciones como completadas para Prisma", async () => {
    const url = await basePropia("contable_db_reinicio_demo");
    const demo = new pg.Client({ connectionString: url });
    await demo.connect();
    try {
      await reiniciarBaseDemo(demo);
      const migraciones = await demo.query<{ cantidad: string; pendientes: string }>(
        `select count(*)::text as cantidad,
                count(*) filter (where finished_at is null)::text as pendientes
         from public."_prisma_migrations"`,
      );
      expect(Number(migraciones.rows[0]?.cantidad)).toBeGreaterThan(0);
      expect(migraciones.rows[0]?.pendientes).toBe("0");
      const tablas = await demo.query("select to_regclass('public.empresas') as empresas");
      expect(tablas.rows[0]?.empresas).toBe("empresas");
    } finally {
      await demo.end();
    }
  });
});
