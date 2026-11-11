import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reiniciarBase } from "./helpers";

let c: pg.Client;
beforeAll(async () => {
  c = await reiniciarBase();
});
afterAll(async () => {
  await c?.end();
});

// El diccionario de datos se genera de estos comentarios: toda tabla y columna nueva debe documentarse.
describe("diccionario de datos", () => {
  it("todas las tablas tienen descripción", async () => {
    const r = await c.query(`
      select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and obj_description(c.oid, 'pg_class') is null`);
    expect(r.rows.map((x) => x.tabla)).toEqual([]);
  });

  it("todas las columnas tienen descripción", async () => {
    const r = await c.query(`
      select c.relname || '.' || a.attname as columna
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
        and col_description(c.oid, a.attnum) is null`);
    expect(r.rows.map((x) => x.columna)).toEqual([]);
  });
});
