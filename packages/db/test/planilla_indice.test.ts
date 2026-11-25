import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;

beforeAll(async () => {
  const url = await basePropia("contable_db_planilla_indice");
  c = await reiniciarBase(url);
  esc = await crearEscenario(c, "0614-720001-101-1");
});

afterAll(async () => {
  await c?.end();
});

describe("partidas de planilla por sucursal y período", () => {
  it("impide duplicar el período, pero permite otra fecha, sucursal o partida manual", async () => {
    await c.query(
      "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
        "values ($1, $2, '2026-11-30', 'Planilla de prueba', 'planilla')",
      [esc.empresaId, esc.sucursalId],
    );
    const duplicada = await errorDe(
      c,
      "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
        "values ($1, $2, '2026-11-30', 'Planilla repetida', 'planilla')",
      [esc.empresaId, esc.sucursalId],
    );
    expect(duplicada).toContain("partidas_planilla_sucursal_fecha_unq");

    await expect(
      c.query(
        "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
          "values ($1, $2, '2026-12-31', 'Planilla siguiente', 'planilla')",
        [esc.empresaId, esc.sucursalId],
      ),
    ).resolves.toBeDefined();
    await c.query(
      "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
        "values ($1, $2, '2026-11-30', 'Partida manual', 'manual')",
      [esc.empresaId, esc.sucursalId],
    );
    const sucursal = await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) " +
        "values ($1, 'Sucursal auxiliar', 'S002') returning id",
      [esc.empresaId],
    );
    await c.query(
      "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
        "values ($1, $2, '2026-11-30', 'Planilla de otra sucursal', 'planilla')",
      [esc.empresaId, sucursal.rows[0]!.id],
    );
  });
});
