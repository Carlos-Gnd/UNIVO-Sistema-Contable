// Pago a cuenta y retenciones del F-14 (migración 20261130000000_pagos_a_cuenta, HU-49, S3-T46).
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
let otra: Escenario;
const usuarioId = "11111111-1111-4111-8111-111111111111";

const partida = (e: Escenario, fecha: string) =>
  crearPartida(c, e, fecha, [
    [e.cuentas["110101"]!, "10", "0"],
    [e.cuentas["5101"]!, "0", "10"],
  ]);

const insertar = (e: Escenario, periodo: string, partidaId: string) =>
  errorDe(
    c,
    `insert into pagos_a_cuenta (empresa_id, periodo, tasa, ingresos_brutos, pago_a_cuenta, retenciones_planilla, retenciones_servicios, partida_id)
     values ($1, $2, 1.75, 1000, 17.50, 0, 0, $3)`,
    [e.empresaId, periodo, partidaId],
  );

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "1234-567890-123-0");
  await c.query(`insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'c@pago.test')`, [
    usuarioId,
  ]);
});
afterAll(async () => {
  await c?.end();
});

describe("pagos_a_cuenta", () => {
  it("guarda el mes con una partida del último día de ese mes", async () => {
    expect(await insertar(esc, "2026-10-01", await partida(esc, "2026-10-31"))).toBeNull();
  });

  it("el período es el primer día del mes y es único por empresa", async () => {
    expect(await insertar(esc, "2026-09-15", await partida(esc, "2026-09-30"))).toMatch(/periodo_inicio_mes/);
    expect(await insertar(esc, "2026-10-01", await partida(esc, "2026-10-31"))).toMatch(
      /pagos_a_cuenta_empresa_periodo_unq/,
    );
  });

  it("la partida debe ser de la misma empresa y del último día del mes", async () => {
    expect(await insertar(esc, "2026-08-01", await partida(otra, "2026-08-31"))).toMatch(
      /no pertenece a la empresa/,
    );
    expect(await insertar(esc, "2026-08-01", await partida(esc, "2026-08-15"))).toMatch(/último día del mes/);
  });

  it("rechaza importes negativos y una tasa fuera de rango", async () => {
    const p = await partida(esc, "2026-07-31");
    expect(
      await errorDe(
        c,
        `insert into pagos_a_cuenta (empresa_id, periodo, tasa, ingresos_brutos, pago_a_cuenta, retenciones_planilla, retenciones_servicios, partida_id)
         values ($1, '2026-07-01', 1.75, -1, 0, 0, 0, $2)`,
        [esc.empresaId, p],
      ),
    ).toMatch(/importes_no_negativos/);
    expect(
      await errorDe(
        c,
        `insert into pagos_a_cuenta (empresa_id, periodo, tasa, ingresos_brutos, pago_a_cuenta, retenciones_planilla, retenciones_servicios, partida_id)
         values ($1, '2026-07-01', 0, 1, 0, 0, 0, $2)`,
        [esc.empresaId, p],
      ),
    ).toMatch(/tasa_valida/);
  });

  it("solo se presenta con la partida contabilizada; presentado, no se modifica ni se elimina", async () => {
    const id = await partida(esc, "2026-06-30");
    expect(await insertar(esc, "2026-06-01", id)).toBeNull();
    const presentar = `update pagos_a_cuenta set presentada_en = now(), presentada_por = $2 where partida_id = $1`;
    expect(await errorDe(c, presentar, [id, usuarioId])).toMatch(/debe estar contabilizada/);
    await contabilizar(c, id);
    expect(await errorDe(c, presentar, [id, usuarioId])).toBeNull();
    expect(
      await errorDe(c, `update pagos_a_cuenta set pago_a_cuenta = 1 where partida_id = $1`, [id]),
    ).toMatch(/ya presentado/);
    expect(await errorDe(c, `delete from pagos_a_cuenta where partida_id = $1`, [id])).toMatch(
      /ya presentado/,
    );
  });

  it("la presentación necesita fecha y usuario juntos", async () => {
    const id = await partida(esc, "2026-05-31");
    await insertar(esc, "2026-05-01", id);
    await contabilizar(c, id);
    expect(
      await errorDe(c, `update pagos_a_cuenta set presentada_en = now() where partida_id = $1`, [id]),
    ).toMatch(/presentacion_completa/);
  });

  it("la partida solo se reemplaza cuando la anterior quedó anulada", async () => {
    const vieja = await partida(esc, "2026-04-30");
    await insertar(esc, "2026-04-01", vieja);
    const nueva = await partida(esc, "2026-04-30");
    const reemplazar = `update pagos_a_cuenta set partida_id = $2 where partida_id = $1`;
    expect(await errorDe(c, reemplazar, [vieja, nueva])).toMatch(/cuando la anterior fue anulada/);
    await contabilizar(c, vieja);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
      vieja,
    ]);
    expect(await errorDe(c, reemplazar, [vieja, nueva])).toBeNull();
  });

  it("registra los cambios en la bitácora", async () => {
    const r = await c.query(`select count(*)::int as n from bitacora where tabla = 'pagos_a_cuenta'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
