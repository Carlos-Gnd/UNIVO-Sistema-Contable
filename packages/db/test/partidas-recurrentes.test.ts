// Plantillas de partidas recurrentes (migración 20261128000000_partidas_recurrentes, HU-26, S3-T04).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "1234-567890-123-0");
});
afterAll(async () => {
  await c?.end();
});

const plantilla = async (e: Escenario, nombre: string, sucursalId = e.sucursalId) =>
  (
    await c.query(
      `insert into plantillas_recurrentes (empresa_id, sucursal_id, nombre) values ($1, $2, $3) returning id::text`,
      [e.empresaId, sucursalId, nombre],
    )
  ).rows[0].id as string;

describe("plantillas recurrentes", () => {
  it("el nombre es único por empresa y se puede repetir en otra", async () => {
    await plantilla(esc, "Alquiler");
    expect(
      await errorDe(
        c,
        `insert into plantillas_recurrentes (empresa_id, sucursal_id, nombre) values ($1, $2, 'Alquiler')`,
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/plantillas_recurrentes_empresa_id_nombre_key/);
    await plantilla(otra, "Alquiler");
  });

  it("rechaza un nombre vacío y una sucursal de otra empresa", async () => {
    expect(
      await errorDe(
        c,
        `insert into plantillas_recurrentes (empresa_id, sucursal_id, nombre) values ($1, $2, '  ')`,
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/nombre_no_vacio/);
    expect(
      await errorDe(
        c,
        `insert into plantillas_recurrentes (empresa_id, sucursal_id, nombre) values ($1, $2, 'X')`,
        [esc.empresaId, otra.sucursalId],
      ),
    ).toMatch(/sucursal no pertenece/);
  });
});

describe("líneas de la plantilla", () => {
  it("exigen importe en un solo lado y cuenta imputable de la empresa", async () => {
    const id = await plantilla(esc, "Sueldos");
    const insertar = (cuenta: string, debe: string, haber: string, orden: number) =>
      errorDe(
        c,
        `insert into plantilla_recurrente_lineas (empresa_id, plantilla_id, cuenta_id, debe, haber, orden) values ($1, $2, $3, $4, $5, $6)`,
        [esc.empresaId, id, cuenta, debe, haber, orden],
      );
    expect(await insertar(esc.cuentas["110101"]!, "10", "0", 0)).toBeNull();
    expect(await insertar(esc.cuentas["5101"]!, "5", "5", 1)).toMatch(/importe_valido/);
    expect(await insertar(esc.cuentas["5101"]!, "0", "0", 2)).toMatch(/importe_valido/);
    expect(await insertar(otra.cuentas["110101"]!, "5", "0", 3)).toMatch(/no existe en esta empresa/);
    expect(await insertar(esc.cuentas["5101"]!, "0", "10", 0)).toMatch(/plantilla_id_orden_key/);
  });
});

describe("una partida recurrente activa por mes", () => {
  const partida = (origenId: string, fecha: string, estado = "borrador") =>
    errorDe(
      c,
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, estado, origen, origen_id)
       values ($1, $2, $3::date, 'operacion', $4::estado_partida, 'recurrente', $5::uuid)`,
      [esc.empresaId, esc.sucursalId, fecha, estado, origenId],
    );

  it("impide dos partidas de la misma plantilla en el mismo mes, y permite otro mes", async () => {
    const id = await plantilla(esc, "Internet");
    expect(await partida(id, "2026-11-05")).toBeNull();
    expect(await partida(id, "2026-11-20")).toMatch(/partidas_recurrente_mes_unq/);
    expect(await partida(id, "2026-12-05")).toBeNull();
  });
});
