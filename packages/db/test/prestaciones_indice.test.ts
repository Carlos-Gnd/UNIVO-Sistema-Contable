import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;

beforeAll(async () => {
  const url = await basePropia("contable_db_prestaciones_indice");
  c = await reiniciarBase(url);
  esc = await crearEscenario(c, "0614-740001-101-1");
});

afterAll(async () => {
  await c?.end();
});

describe("provisiones mensuales de prestaciones", () => {
  it("impide duplicar el período por sucursal y permite el período siguiente", async () => {
    await c.query(
      "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
        "values ($1, $2, '2026-11-30', 'Provisión noviembre', 'prestaciones')",
      [esc.empresaId, esc.sucursalId],
    );
    const duplicada = await errorDe(
      c,
      "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
        "values ($1, $2, '2026-11-30', 'Provisión repetida', 'prestaciones')",
      [esc.empresaId, esc.sucursalId],
    );
    expect(duplicada).toContain("partidas_prestaciones_sucursal_fecha_unq");

    await expect(
      c.query(
        "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
          "values ($1, $2, '2026-12-31', 'Provisión diciembre', 'prestaciones')",
        [esc.empresaId, esc.sucursalId],
      ),
    ).resolves.toBeDefined();
  });
});
