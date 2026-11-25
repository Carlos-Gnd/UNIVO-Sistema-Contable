import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

const TABLA_OFICIAL = [
  { orden: 1, desde: "0.00", hasta: "6600.00", porcentaje: "0.00", cuotaFija: "0.00" },
  { orden: 2, desde: "6600.00", hasta: "10742.86", porcentaje: "10.00", cuotaFija: "212.12" },
  { orden: 3, desde: "10742.86", hasta: "24457.14", porcentaje: "20.00", cuotaFija: "720.00" },
  { orden: 4, desde: "24457.14", hasta: null, porcentaje: "30.00", cuotaFija: "3462.86" },
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let natural: Escenario;
let sociedad: Escenario;

async function insertarNatural(empresaId: string, tramos = TABLA_OFICIAL, version = 2) {
  await c.query("BEGIN");
  const config = await c.query<{ id: string }>(
    "INSERT INTO configuraciones_isr (empresa_id, ejercicio_anio, version) VALUES ($1, 2026, $2) RETURNING id",
    [empresaId, version],
  );
  for (const tramo of tramos) {
    await c.query(
      `INSERT INTO tramos_isr (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        empresaId,
        config.rows[0]!.id,
        tramo.orden,
        tramo.desde,
        tramo.hasta,
        tramo.porcentaje,
        tramo.cuotaFija,
      ],
    );
  }
  const error = await errorDe(c, "COMMIT");
  if (error) await c.query("ROLLBACK").catch(() => undefined);
  return { id: config.rows[0]!.id, error };
}

beforeAll(async () => {
  const url = await basePropia("contable_db_isr_anual");
  c = await reiniciarBase(url);
  natural = await crearEscenario(c, "0614-000001-101-1");
  sociedad = await crearEscenario(c, "0614-000002-101-2");
  await c.query("UPDATE empresas SET tipo_contribuyente = 'sociedad' WHERE id = $1", [sociedad.empresaId]);
});

afterAll(async () => {
  await c?.end();
});

describe("configuración anual del ISR en la base", () => {
  it("siembra la tabla anual oficial inicial para persona natural y habilita RLS", async () => {
    const filas = await c.query<{ relname: string; relrowsecurity: boolean }>(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('configuraciones_isr', 'tramos_isr') ORDER BY relname",
    );
    const configuraciones = await c.query(
      "SELECT count(*)::int AS cantidad FROM configuraciones_isr WHERE empresa_id = $1",
      [natural.empresaId],
    );
    expect(filas.rows).toEqual([
      { relname: "configuraciones_isr", relrowsecurity: true },
      { relname: "tramos_isr", relrowsecurity: true },
    ]);
    expect(configuraciones.rows[0]?.cantidad).toBe(1);
    const tramos = await c.query(
      `SELECT orden, desde::text, hasta::text, porcentaje::text, cuota_fija::text AS "cuotaFija"
       FROM tramos_isr WHERE empresa_id = $1 ORDER BY orden`,
      [natural.empresaId],
    );
    expect(tramos.rows).toEqual(TABLA_OFICIAL);
  });

  it("acepta una tabla natural válida y la conserva en la bitácora", async () => {
    const creada = await insertarNatural(natural.empresaId);
    expect(creada.error).toBeNull();

    const cuenta = await c.query(
      "SELECT count(*)::int AS cantidad FROM bitacora WHERE tabla IN ('configuraciones_isr', 'tramos_isr') AND registro_id = $1",
      [creada.id],
    );
    expect(cuenta.rows[0]?.cantidad).toBe(1);
    const tramos = await c.query(
      "SELECT orden, desde::text, hasta::text, porcentaje::text FROM tramos_isr WHERE configuracion_id = $1 ORDER BY orden",
      [creada.id],
    );
    expect(tramos.rows).toEqual([
      { orden: 1, desde: "0.00", hasta: "6600.00", porcentaje: "0.00" },
      { orden: 2, desde: "6600.00", hasta: "10742.86", porcentaje: "10.00" },
      { orden: 3, desde: "10742.86", hasta: "24457.14", porcentaje: "20.00" },
      { orden: 4, desde: "24457.14", hasta: null, porcentaje: "30.00" },
    ]);
  });

  it("rechaza tramos discontinuos, desordenados o con más de un límite abierto", async () => {
    const discontinuos = await insertarNatural(
      natural.empresaId,
      [TABLA_OFICIAL[0]!, { ...TABLA_OFICIAL[1]!, desde: "6600.01" }, ...TABLA_OFICIAL.slice(2)],
      3,
    );
    expect(discontinuos.error).toContain("continuos y sin traslapes");

    const abiertos = await insertarNatural(
      natural.empresaId,
      [
        { ...TABLA_OFICIAL[0]!, hasta: null },
        { ...TABLA_OFICIAL[1]!, orden: 2, desde: "6600.00", hasta: null },
      ],
      4,
    );
    expect(abiertos.error).toContain("Solo el último tramo anual");
  });

  it("exige tasa para sociedades y no permite mezclarla con tramos naturales", async () => {
    await c.query("BEGIN");
    const sinTasa = await c.query(
      "INSERT INTO configuraciones_isr (empresa_id, ejercicio_anio, version) VALUES ($1, 2026, 2) RETURNING id",
      [sociedad.empresaId],
    );
    const error = await errorDe(c, "COMMIT");
    if (error) await c.query("ROLLBACK").catch(() => undefined);
    expect(error).toContain("sociedad requiere una tasa");

    await c.query("BEGIN");
    const soloTasa = await c.query<{ id: string }>(
      "INSERT INTO configuraciones_isr (empresa_id, ejercicio_anio, version, tasa_sociedad) VALUES ($1, 2026, 2, 25.00) RETURNING id",
      [sociedad.empresaId],
    );
    const creada = await errorDe(c, "COMMIT");
    expect(creada).toBeNull();
    expect(soloTasa.rows[0]?.id).toBeTruthy();

    const cambio = await errorDe(c, "UPDATE configuraciones_isr SET tasa_sociedad = 30.00 WHERE id = $1", [
      soloTasa.rows[0]!.id,
    ]);
    expect(cambio).toContain("configuración anual del ISR es inmutable");
    expect(sinTasa.rows[0]?.id).toBeTruthy();
  });

  it("bloquea configuraciones de otro ejercicio y tramos asociados a otra empresa", async () => {
    const creada = await insertarNatural(natural.empresaId, TABLA_OFICIAL, 5);
    expect(creada.error).toBeNull();

    const otroAnio = await errorDe(
      c,
      "INSERT INTO configuraciones_isr (empresa_id, ejercicio_anio, version) VALUES ($1, 2027, 1)",
      [natural.empresaId],
    );
    expect(otroAnio).toContain("configuraciones_isr_ejercicio_empresa_fkey");

    const cruzado = await errorDe(
      c,
      `INSERT INTO tramos_isr (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
       VALUES ($1, $2, 5, 24457.14, NULL, 30, 3462.86)`,
      [sociedad.empresaId, creada.id],
    );
    expect(cruzado).toContain("tramos_isr_configuracion_empresa_fkey");
  });
});
