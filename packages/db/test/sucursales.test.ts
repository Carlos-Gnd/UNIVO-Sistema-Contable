// Reglas de sucursales en la base (migración 20261113000100_reglas_sucursales, HU-07).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  contabilizar,
  crearEscenario,
  crearPartida,
  errorDe,
  reiniciarBase,
  type Escenario,
} from "./helpers";

let c: pg.Client;
let esc: Escenario;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
});
afterAll(async () => {
  await c?.end();
});

const nuevaSucursal = async (codigo: string, activa = true) =>
  (
    await c.query<{ id: string }>(
      `insert into sucursales (empresa_id, nombre, codigo_establecimiento, activa) values ($1, $2, $3, $4) returning id`,
      [esc.empresaId, `Sucursal ${codigo}`, codigo, activa],
    )
  ).rows[0]!.id;

const lineas = (): [string, string, string][] => [
  [esc.cuentas["110101"]!, "10", "0"],
  [esc.cuentas["5101"]!, "0", "10"],
];

describe("casa matriz", () => {
  it("solo hay una por empresa", async () => {
    expect(
      await errorDe(
        c,
        `insert into sucursales (empresa_id, nombre, codigo_establecimiento, es_matriz) values ($1, 'Otra matriz', 'M002', true)`,
        [esc.empresaId],
      ),
    ).toMatch(/sucursales_una_matriz_por_empresa/);
    // otra empresa sí tiene su propia matriz
    expect((await crearEscenario(c, "1234-567890-123-0")).sucursalId).toBeTruthy();
  });

  it("no se puede inactivar ni dejar de ser matriz para crear otra", async () => {
    expect(await errorDe(c, `update sucursales set activa = false where id = $1`, [esc.sucursalId])).toMatch(
      /sucursales_matriz_activa/,
    );
    const otra = await nuevaSucursal("S010");
    expect(await errorDe(c, `update sucursales set es_matriz = true where id = $1`, [otra])).toMatch(
      /sucursales_una_matriz_por_empresa/,
    );
  });
});

describe("partidas en sucursales inactivas", () => {
  it("no se registran partidas nuevas en una sucursal inactiva", async () => {
    const inactiva = await nuevaSucursal("S020", false);
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2026-07-01')`,
        [esc.empresaId, inactiva],
      ),
    ).toMatch(/sucursal está inactiva/);
  });

  it("no se mueve una partida a una sucursal inactiva", async () => {
    const inactiva = await nuevaSucursal("S030", false);
    const id = await crearPartida(c, esc, "2026-07-02", lineas());
    expect(await errorDe(c, `update partidas set sucursal_id = $1 where id = $2`, [inactiva, id])).toMatch(
      /sucursal está inactiva/,
    );
  });

  it("los pendientes de una sucursal que se inactiva se pueden editar, contabilizar y revertir", async () => {
    const sucursal = await nuevaSucursal("S040");
    const enSucursal = { ...esc, sucursalId: sucursal };
    const borrador = await crearPartida(c, enSucursal, "2026-07-03", lineas());
    const contabilizada = await crearPartida(c, enSucursal, "2026-07-03", lineas());
    await contabilizar(c, contabilizada);
    await c.query(`update sucursales set activa = false where id = $1`, [sucursal]);

    expect(
      await errorDe(c, `update partidas set concepto = 'Corregido' where id = $1`, [borrador]),
    ).toBeNull();
    expect((await contabilizar(c, borrador)).rows[0].numero).toBeGreaterThan(0);

    // la reversión de una partida de la sucursal se registra en la misma sucursal
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha, tipo, partida_revertida_id)
         values ($1, $2, '2026-07-04', 'reversion', $3)`,
        [esc.empresaId, sucursal, contabilizada],
      ),
    ).toBeNull();
  });
});
