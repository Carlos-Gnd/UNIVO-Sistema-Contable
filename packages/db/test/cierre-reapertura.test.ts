import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let ejercicioId: string;
let cierreId: string;

beforeAll(async () => {
  const url = await basePropia("contable_db_cierre_reapertura");
  c = await reiniciarBase(url);
  esc = await crearEscenario(c, "0614-990010-101-1");
  const ejercicio = await c.query<{ id: string }>(
    "SELECT id FROM ejercicios WHERE empresa_id = $1 AND anio = 2026",
    [esc.empresaId],
  );
  ejercicioId = ejercicio.rows[0]!.id;
});

afterAll(async () => {
  await c?.end();
});

describe("reglas de cierre y reapertura anual", () => {
  it("exige partida de cierre contabilizada y doce períodos cerrados para cerrar el ejercicio", async () => {
    const antesDePartida = await errorDe(c, "UPDATE ejercicios SET estado = 'cerrado' WHERE id = $1", [
      ejercicioId,
    ]);
    expect(antesDePartida).toContain("Cierre los doce períodos");

    await c.query("UPDATE periodos SET estado = 'cerrado' WHERE ejercicio_id = $1", [ejercicioId]);
    const ejercicioSinCierre = await errorDe(c, "UPDATE ejercicios SET estado = 'cerrado' WHERE id = $1", [
      ejercicioId,
    ]);
    expect(ejercicioSinCierre).toContain("Contabilice la partida de cierre anual");
    await c.query(
      "UPDATE periodos SET estado = 'abierto', motivo_reapertura = 'Reabrir para prueba anual' WHERE ejercicio_id = $1",
      [ejercicioId],
    );

    const partida = await c.query<{ id: string }>(
      `INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       VALUES ($1, $2, '2026-12-31', 'cierre', 'Cierre anual de prueba', 'cierre_anual', $3) RETURNING id`,
      [esc.empresaId, esc.sucursalId, ejercicioId],
    );
    cierreId = partida.rows[0]!.id;
    await c.query(
      `INSERT INTO partida_detalles (partida_id, cuenta_id, debe, haber, orden)
       VALUES ($1, $2, 100.00, 0.00, 0), ($1, $3, 0.00, 100.00, 1)`,
      [cierreId, esc.cuentas["110101"], esc.cuentas["5101"]],
    );
    const duplicadoCierre = await errorDe(
      c,
      `INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       VALUES ($1, $2, '2026-12-31', 'cierre', 'Cierre duplicado', 'cierre_anual', $3)`,
      [esc.empresaId, esc.sucursalId, ejercicioId],
    );
    expect(duplicadoCierre).toContain("partidas_cierre_anual_activa_unq");
    await c.query("UPDATE partidas SET estado = 'contabilizada' WHERE id = $1", [cierreId]);
    await c.query("UPDATE periodos SET estado = 'cerrado' WHERE ejercicio_id = $1", [ejercicioId]);
    await c.query("UPDATE ejercicios SET estado = 'cerrado' WHERE id = $1", [ejercicioId]);

    const nuevaPartida = await errorDe(
      c,
      `INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
       VALUES ($1, $2, '2026-12-31', 'operacion', 'No debe guardarse')`,
      [esc.empresaId, esc.sucursalId],
    );
    expect(nuevaPartida).toContain("cerrado");
  });

  it("evita una segunda partida activa de cierre o reapertura para el mismo ejercicio", async () => {
    await c.query(
      "INSERT INTO ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) VALUES ($1, 2027, '2027-01-01', '2027-12-31')",
      [esc.empresaId],
    );
    await c.query(
      `INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       VALUES ($1, $2, '2027-01-01', 'reapertura', 'Reapertura de prueba', 'reapertura_ejercicio', $3)`,
      [esc.empresaId, esc.sucursalId, ejercicioId],
    );
    const duplicadoReapertura = await errorDe(
      c,
      `INSERT INTO partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
       VALUES ($1, $2, '2027-01-01', 'reapertura', 'Reapertura duplicada', 'reapertura_ejercicio', $3)`,
      [esc.empresaId, esc.sucursalId, ejercicioId],
    );
    expect(duplicadoReapertura).toContain("partidas_reapertura_anual_activa_unq");
  });
});
