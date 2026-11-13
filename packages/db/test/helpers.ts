// Utilidades para probar las reglas de la base de datos contra un PostgreSQL real.
// Por defecto usa el contenedor local (podman/docker) en el puerto 54329; en CI, TEST_DATABASE_URL.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export const URL_PRUEBAS =
  process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:54329/contable";

const MIGRACIONES = path.resolve(import.meta.dirname, "../prisma/migrations");

/**
 * Devuelve la URL de una base de pruebas propia (por ejemplo para la API), creándola si no existe, en el
 * mismo servidor que URL_PRUEBAS. Así las pruebas de cada paquete pueden correr en paralelo.
 */
export async function basePropia(nombre: string): Promise<string> {
  const url = new URL(URL_PRUEBAS);
  const c = new pg.Client({ connectionString: URL_PRUEBAS });
  await c.connect();
  await c.query("SELECT pg_advisory_lock(1729, hashtext($1))", [nombre]);
  try {
    const existe = await c.query("select 1 from pg_database where datname = $1", [nombre]);
    if (existe.rowCount === 0) await c.query(`create database "${nombre}"`);
  } finally {
    try {
      await c.query("SELECT pg_advisory_unlock(1729, hashtext($1))", [nombre]);
    } finally {
      await c.end();
    }
  }
  url.pathname = `/${nombre}`;
  return url.toString();
}

/** Borra el esquema public y aplica todas las migraciones en orden. */
export async function reiniciarBase(connectionString = URL_PRUEBAS): Promise<pg.Client> {
  const c = new pg.Client({ connectionString });
  await c.connect();
  await c.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS interno CASCADE; CREATE SCHEMA public;",
  );
  const dirs = readdirSync(MIGRACIONES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const d of dirs) await c.query(readFileSync(path.join(MIGRACIONES, d, "migration.sql"), "utf8"));
  return c;
}

/** Ejecuta y devuelve el mensaje de error de PostgreSQL, o null si no falló. */
export async function errorDe(c: pg.Client, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await c.query(sql, params);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export interface Escenario {
  empresaId: string;
  sucursalId: string;
  cuentas: Record<string, string>;
}

/**
 * Crea una empresa con su casa matriz, el ejercicio 2026 (con sus 12 períodos) y un catálogo mínimo:
 * 1 Activo › 11 Activo corriente › 1101 Efectivo › 110101 Caja general
 * 5 Ingresos › 51 Ingresos de operación › 5101 Ventas
 */
export async function crearEscenario(c: pg.Client, nit: string, modo = "anual"): Promise<Escenario> {
  const e = await c.query(
    `insert into empresas (nombre, nit, tipo_contribuyente, modo_numeracion) values ($1, $2, 'persona_natural', $3) returning id`,
    [`Empresa ${nit}`, nit, modo],
  );
  const empresaId = e.rows[0].id as string;
  const s = await c.query(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz) values ($1, 'Casa matriz', 'M001', true) returning id`,
    [empresaId],
  );
  await c.query(
    `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')`,
    [empresaId],
  );
  const cuentas: Record<string, string> = {};
  const catalogo: [string, string, string, string][] = [
    ["1", "Activo", "deudora", "activo"],
    ["11", "Activo corriente", "deudora", "activo"],
    ["1101", "Efectivo y equivalentes", "deudora", "activo"],
    ["110101", "Caja general", "deudora", "activo"],
    ["5", "Ingresos", "acreedora", "ingresos"],
    ["51", "Ingresos de operación", "acreedora", "ingresos"],
    ["5101", "Ventas", "acreedora", "ingresos"],
  ];
  for (const [codigo, nombre, naturaleza, tipo] of catalogo) {
    const r = await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, $4, $5) returning id`,
      [empresaId, codigo, nombre, naturaleza, tipo],
    );
    cuentas[codigo] = r.rows[0].id as string;
  }
  return { empresaId, sucursalId: s.rows[0].id as string, cuentas };
}

/** Crea una partida en borrador con sus líneas [cuentaId, debe, haber] y devuelve su id. */
export async function crearPartida(
  c: pg.Client,
  esc: Escenario,
  fecha: string,
  lineas: [string, string, string][],
  tipo = "operacion",
): Promise<string> {
  const p = await c.query(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto) values ($1, $2, $3, $4, 'Prueba') returning id`,
    [esc.empresaId, esc.sucursalId, fecha, tipo],
  );
  const id = p.rows[0].id as string;
  let orden = 0;
  for (const [cuentaId, debe, haber] of lineas) {
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, $3, $4, $5)`,
      [id, cuentaId, debe, haber, orden++],
    );
  }
  return id;
}

export const contabilizar = (c: pg.Client, id: string) =>
  c.query(`update partidas set estado = 'contabilizada' where id = $1 returning numero, ambito_numeracion`, [
    id,
  ]);
