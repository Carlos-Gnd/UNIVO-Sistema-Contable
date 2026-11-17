// Alcance por sucursal según el rol (migración 20261113000200_alcance_sucursales_por_rol, HU-08).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
});
afterAll(async () => {
  await c?.end();
});

let n = 0;
/** Crea un usuario y su membresía; devuelve el error de PostgreSQL o null. */
async function membresia(rol: number, todas: boolean) {
  const id = `b0000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${n}`,
    `u${n}@prueba.sv`,
  ]);
  return errorDe(
    c,
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, esc.empresaId, rol, todas],
  );
}

describe("alcance por sucursal según el rol", () => {
  it("administrador y contador ven todas las sucursales", async () => {
    expect(await membresia(1, true)).toBeNull();
    expect(await membresia(2, true)).toBeNull();
    expect(await membresia(1, false)).toMatch(/membresias_alcance_por_rol/);
    expect(await membresia(2, false)).toMatch(/membresias_alcance_por_rol/);
  });

  it("auxiliar y consulta solo ven las asignadas", async () => {
    expect(await membresia(3, false)).toBeNull();
    expect(await membresia(4, false)).toBeNull();
    expect(await membresia(3, true)).toMatch(/membresias_alcance_por_rol/);
    expect(await membresia(4, true)).toMatch(/membresias_alcance_por_rol/);
  });

  it("al cambiar de rol hay que cambiar también el alcance", async () => {
    const r = await c.query("select id from membresias where empresa_id = $1 and rol_id = 3 limit 1", [
      esc.empresaId,
    ]);
    const id = r.rows[0].id as string;
    expect(await errorDe(c, "update membresias set rol_id = 2 where id = $1", [id])).toMatch(
      /membresias_alcance_por_rol/,
    );
    expect(
      await errorDe(c, "update membresias set rol_id = 2, todas_sucursales = true where id = $1", [id]),
    ).toBeNull();
  });
});
