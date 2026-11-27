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

  it("prepara 24 meses de historial, cierra resultados en 2024 y 2025 y conserva el caso académico", async () => {
    const resultado = await c.query<{ meses: string; partidas: string; ejercicios: string }>(
      `select count(distinct to_char(fecha, 'YYYY-MM'))::text as meses,
              count(*)::text as partidas,
              (select count(*)::text from ejercicios) as ejercicios
       from partidas`,
    );

    expect(resultado.rows[0]).toEqual({ meses: "24", partidas: "138", ejercicios: "3" });
    const cierres = await c.query<{ fecha: string; concepto: string }>(
      `select fecha::text, concepto from partidas where tipo = 'cierre' and fecha < '2026-01-01' order by fecha`,
    );
    expect(cierres.rows).toEqual([
      { fecha: "2024-12-31", concepto: "Cierre de resultados 2024" },
      { fecha: "2025-12-31", concepto: "Cierre de resultados 2025" },
    ]);
    const resultadosHistoricos = await c.query<{ anio: number; saldo: string }>(
      `select extract(year from p.fecha)::int as anio, sum(d.debe - d.haber)::numeric(14,2)::text as saldo
       from partidas p join partida_detalles d on d.partida_id = p.id
       join cuentas c on c.id = d.cuenta_id
       where p.empresa_id = (select empresa_id from partidas order by fecha limit 1)
         and p.fecha < '2026-01-01' and c.tipo in ('ingresos', 'costos_gastos')
       group by anio order by anio`,
    );
    expect(resultadosHistoricos.rows).toEqual([
      { anio: 2024, saldo: "0.00" },
      { anio: 2025, saldo: "0.00" },
    ]);
  });
});

describe("reinicio de base demo", () => {
  it("rechaza conexiones redirigidas antes de ejecutar cualquier borrado", async () => {
    const consultas: string[] = [];
    const clienteFalso = {
      query: async (sql: string) => {
        consultas.push(sql);
        return { rows: [{ base_correcta: true, servidor_local: false }] };
      },
    } as unknown as pg.Client;
    await expect(reiniciarBaseDemo(clienteFalso)).rejects.toThrow(/servidor local/);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContain("current_database()");
  });
});
