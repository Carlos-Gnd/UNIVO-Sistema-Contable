import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia } from "./helpers";

const migraciones = path.resolve(import.meta.dirname, "../prisma/migrations");
const migracionInicial = "20261126000100_isr_tramos_iniciales";
const tabla = [
  { orden: 1, desde: "0.00", hasta: "6600.00", porcentaje: "0.00", cuota_fija: "0.00" },
  { orden: 2, desde: "6600.00", hasta: "10742.86", porcentaje: "10.00", cuota_fija: "212.12" },
  { orden: 3, desde: "10742.86", hasta: "24457.14", porcentaje: "20.00", cuota_fija: "720.00" },
  { orden: 4, desde: "24457.14", hasta: null, porcentaje: "30.00", cuota_fija: "3462.86" },
];

let c: pg.Client;
let empresaId: string;

beforeAll(async () => {
  const url = await basePropia("contable_db_isr_tramos_iniciales");
  c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS interno CASCADE; CREATE SCHEMA public;",
  );
  const dirs = readdirSync(migraciones, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name < migracionInicial)
    .map((d) => d.name)
    .sort();
  for (const dir of dirs) {
    await c.query(readFileSync(path.join(migraciones, dir, "migration.sql"), "utf8"));
  }

  const empresa = await c.query<{ id: string }>(
    `INSERT INTO empresas (nombre, nit, tipo_contribuyente, modo_numeracion)
     VALUES ('Persona existente', '0614-990001-101-1', 'persona_natural', 'anual') RETURNING id`,
  );
  empresaId = empresa.rows[0]!.id;
  await c.query(
    "INSERT INTO ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) VALUES ($1, 2026, '2026-01-01', '2026-12-31')",
    [empresaId],
  );
  await c.query(readFileSync(path.join(migraciones, migracionInicial, "migration.sql"), "utf8"));
});

afterAll(async () => {
  await c?.end();
});

describe("tabla inicial anual del ISR", () => {
  it("completa ejercicios existentes y nuevos de personas naturales", async () => {
    const ejercicioExistente = await c.query<{ id: string }>(
      "SELECT id FROM configuraciones_isr WHERE empresa_id = $1 AND ejercicio_anio = 2026",
      [empresaId],
    );
    expect(ejercicioExistente.rowCount).toBe(1);
    const tramosExistentes = await c.query(
      `SELECT t.orden, t.desde::text, t.hasta::text, t.porcentaje::text, t.cuota_fija::text
       FROM tramos_isr t JOIN configuraciones_isr cfg ON cfg.id = t.configuracion_id
       WHERE cfg.empresa_id = $1 AND cfg.ejercicio_anio = 2026 ORDER BY t.orden`,
      [empresaId],
    );
    expect(tramosExistentes.rows).toEqual(tabla);

    await c.query(
      "INSERT INTO ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) VALUES ($1, 2027, '2027-01-01', '2027-12-31')",
      [empresaId],
    );
    const tramosNuevos = await c.query(
      `SELECT t.orden, t.desde::text, t.hasta::text, t.porcentaje::text, t.cuota_fija::text
       FROM tramos_isr t JOIN configuraciones_isr cfg ON cfg.id = t.configuracion_id
       WHERE cfg.empresa_id = $1 AND cfg.ejercicio_anio = 2027 ORDER BY t.orden`,
      [empresaId],
    );
    expect(tramosNuevos.rows).toEqual(tabla);
  });

  it("no crea tramos naturales para una sociedad", async () => {
    const empresa = await c.query<{ id: string }>(
      `INSERT INTO empresas (nombre, nit, tipo_contribuyente, modo_numeracion)
       VALUES ('Sociedad', '0614-990002-101-2', 'sociedad', 'anual') RETURNING id`,
    );
    await c.query(
      "INSERT INTO ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) VALUES ($1, 2026, '2026-01-01', '2026-12-31')",
      [empresa.rows[0]!.id],
    );
    const configuraciones = await c.query(
      "SELECT count(*)::int AS cantidad FROM configuraciones_isr WHERE empresa_id = $1",
      [empresa.rows[0]!.id],
    );
    expect(configuraciones.rows[0]?.cantidad).toBe(0);
  });
});
