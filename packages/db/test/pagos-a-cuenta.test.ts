// Pago a cuenta y retenciones del F-14 (migración 20261130000000_pagos_a_cuenta, HU-49, S3-T46).
import { randomUUID } from "node:crypto";
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

const MONTO = "17.50";

/** Partida de determinación (Dr 111104 / Cr 211101) con el origen que exige la base; `id` es el de la declaración. */
async function partida(e: Escenario, fecha: string, id: string = randomUUID(), monto = MONTO) {
  const p = await c.query(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
     values ($1, $2, $3, 'ajuste', 'Prueba', 'pago_a_cuenta', $4) returning id`,
    [e.empresaId, e.sucursalId, fecha, id],
  );
  const partidaId = p.rows[0].id as string;
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, $4, 0, 0), ($1, $3, 0, $4, 1)`,
    [partidaId, e.cuentas["111104"]!, e.cuentas["211101"]!, monto],
  );
  return { id, partidaId };
}

const insertar = (e: Escenario, periodo: string, p: { id: string; partidaId: string }) =>
  errorDe(
    c,
    `insert into pagos_a_cuenta (id, empresa_id, periodo, tasa, ingresos_brutos, pago_a_cuenta, retenciones_planilla, retenciones_servicios, partida_id)
     values ($1, $2, $3, 1.75, 1000, ${MONTO}, 0, 0, $4)`,
    [p.id, e.empresaId, periodo, p.partidaId],
  );

async function cuentasPago(e: Escenario) {
  for (const [codigo, nombre, naturaleza, tipo] of [
    ["1111", "Pagos anticipados", "deudora", "activo"],
    ["111104", "Pago a Cuenta", "deudora", "activo"],
    ["2", "Pasivo", "acreedora", "pasivo"],
    ["21", "Pasivo corriente", "acreedora", "pasivo"],
    ["2111", "Impuestos por pagar", "acreedora", "pasivo"],
    ["211101", "Pago a Cuenta por pagar", "acreedora", "pasivo"],
  ] as const) {
    const r = await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, $4, $5) returning id`,
      [e.empresaId, codigo, nombre, naturaleza, tipo],
    );
    e.cuentas[codigo] = r.rows[0].id as string;
  }
}

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "1234-567890-123-0");
  await cuentasPago(esc);
  await cuentasPago(otra);
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
        `insert into pagos_a_cuenta (id, empresa_id, periodo, tasa, ingresos_brutos, pago_a_cuenta, retenciones_planilla, retenciones_servicios, partida_id)
         values ($1, $2, '2026-07-01', 1.75, -1, 0, 0, 0, $3)`,
        [p.id, esc.empresaId, p.partidaId],
      ),
    ).toMatch(/importes_no_negativos/);
    expect(
      await errorDe(
        c,
        `insert into pagos_a_cuenta (id, empresa_id, periodo, tasa, ingresos_brutos, pago_a_cuenta, retenciones_planilla, retenciones_servicios, partida_id)
         values ($1, $2, '2026-07-01', 0, 1, 0, 0, 0, $3)`,
        [p.id, esc.empresaId, p.partidaId],
      ),
    ).toMatch(/tasa_valida/);
  });

  const presentar = `update pagos_a_cuenta set presentada_en = now(), presentada_por = $2 where partida_id = $1`;

  it("solo se presenta con la partida contabilizada; presentado, no se modifica ni se elimina", async () => {
    const p = await partida(esc, "2026-06-30");
    expect(await insertar(esc, "2026-06-01", p)).toBeNull();
    expect(await errorDe(c, presentar, [p.partidaId, usuarioId])).toMatch(/debe estar contabilizada/);
    await contabilizar(c, p.partidaId);
    expect(await errorDe(c, presentar, [p.partidaId, usuarioId])).toBeNull();
    expect(
      await errorDe(c, `update pagos_a_cuenta set pago_a_cuenta = 1 where partida_id = $1`, [p.partidaId]),
    ).toMatch(/ya presentado/);
    expect(await errorDe(c, `delete from pagos_a_cuenta where partida_id = $1`, [p.partidaId])).toMatch(
      /ya presentado/,
    );
  });

  it("la presentación necesita fecha y usuario juntos", async () => {
    const p = await partida(esc, "2026-05-31");
    await insertar(esc, "2026-05-01", p);
    await contabilizar(c, p.partidaId);
    expect(
      await errorDe(c, `update pagos_a_cuenta set presentada_en = now() where partida_id = $1`, [
        p.partidaId,
      ]),
    ).toMatch(/presentacion_completa/);
  });

  it("la partida solo se reemplaza cuando la anterior quedó anulada", async () => {
    const vieja = await partida(esc, "2026-04-30");
    await insertar(esc, "2026-04-01", vieja);
    const nueva = await partida(esc, "2026-04-30", vieja.id);
    const reemplazar = `update pagos_a_cuenta set partida_id = $2 where partida_id = $1`;
    expect(await errorDe(c, reemplazar, [vieja.partidaId, nueva.partidaId])).toMatch(
      /cuando la anterior fue anulada/,
    );
    await contabilizar(c, vieja.partidaId);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
      vieja.partidaId,
    ]);
    expect(await errorDe(c, reemplazar, [vieja.partidaId, nueva.partidaId])).toBeNull();
  });

  it("la partida debe ser de origen pago_a_cuenta y apuntar a la declaración", async () => {
    const sinOrigen = await crearPartida(c, esc, "2026-03-31", [
      [esc.cuentas["111104"]!, MONTO, "0"],
      [esc.cuentas["211101"]!, "0", MONTO],
    ]);
    expect(await insertar(esc, "2026-03-01", { id: randomUUID(), partidaId: sinOrigen })).toMatch(
      /origen pago_a_cuenta/,
    );
    const ajena = await partida(esc, "2026-03-31", randomUUID());
    expect(await insertar(esc, "2026-03-01", { id: randomUUID(), partidaId: ajena.partidaId })).toMatch(
      /apuntar a esta declaración/,
    );
  });

  it("no se presenta si el monto de la partida fue editado respecto del pago a cuenta", async () => {
    const p = await partida(esc, "2026-02-28", randomUUID(), "99.00");
    expect(await insertar(esc, "2026-02-01", p)).toBeNull();
    await contabilizar(c, p.partidaId);
    expect(await errorDe(c, presentar, [p.partidaId, usuarioId])).toMatch(
      /no coinciden con el pago a cuenta/,
    );
  });

  it("presentado el F-14, la partida enlazada no se puede anular", async () => {
    const p = await partida(esc, "2026-01-31");
    await insertar(esc, "2026-01-01", p);
    await contabilizar(c, p.partidaId);
    expect(await errorDe(c, presentar, [p.partidaId, usuarioId])).toBeNull();
    expect(
      await errorDe(c, `update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
        p.partidaId,
      ]),
    ).toMatch(/ya presentado/);
  });

  it("registra los cambios en la bitácora", async () => {
    const r = await c.query(`select count(*)::int as n from bitacora where tabla = 'pagos_a_cuenta'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
