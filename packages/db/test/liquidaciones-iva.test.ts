// Liquidación mensual del IVA del F-07 (migración 20261202000000_liquidaciones_iva, HU-48, S3-T43).
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

interface Liquidacion {
  id: string;
  partidaId: string;
}

/**
 * Partida en borrador con origen de liquidación del IVA: Dr 2109 100 / Cr 1112 60 y 211103 40, lo que guarda
 * `insertar`. `id` es el de la liquidación a la que apunta (origen_id).
 */
async function partida(
  e: Escenario,
  fecha: string,
  origen = "liquidacion_iva",
  id: string = randomUUID(),
  porPagar = "40",
): Promise<Liquidacion> {
  const p = await c.query(
    `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto, origen, origen_id)
     values ($1, $2, $3, 'ajuste', 'Prueba', $4, $5) returning id`,
    [e.empresaId, e.sucursalId, fecha, origen, id],
  );
  const partidaId = p.rows[0].id as string;
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
     values ($1, $2, 100, 0, 0), ($1, $3, 0, 100 - $5::numeric, 1), ($1, $4, 0, $5::numeric, 2)`,
    [partidaId, e.cuentas["2109"]!, e.cuentas["1112"]!, e.cuentas["211103"]!, porPagar],
  );
  return { id, partidaId };
}

const insertar = (e: Escenario, periodo: string, l: Liquidacion) =>
  errorDe(
    c,
    `insert into liquidaciones_iva (id, empresa_id, periodo, debito_fiscal, credito_fiscal, percibido_sufrido, retenido_sufrido,
       remanente_anterior, iva_por_pagar, remanente_credito, remanente_percibido, remanente_retenido, partida_id)
     values ($1, $2, $3, 100, 60, 0, 0, 0, 40, 0, 0, 0, $4)`,
    [l.id, e.empresaId, periodo, l.partidaId],
  );

async function cuentasLiquidacion(e: Escenario) {
  for (const [codigo, nombre, naturaleza, tipo] of [
    ["1112", "Crédito Fiscal IVA", "deudora", "activo"],
    ["2", "Pasivo", "acreedora", "pasivo"],
    ["21", "Pasivo corriente", "acreedora", "pasivo"],
    ["2109", "IVA Débito Fiscal", "acreedora", "pasivo"],
    ["2111", "Impuestos por pagar", "acreedora", "pasivo"],
    ["211103", "Impuestos por Pagar · IVA", "acreedora", "pasivo"],
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
  await cuentasLiquidacion(esc);
  await cuentasLiquidacion(otra);
  await c.query(`insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'c@liquidacion.test')`, [
    usuarioId,
  ]);
});
afterAll(async () => {
  await c?.end();
});

describe("liquidaciones_iva", () => {
  it("guarda el mes con una partida del último día de ese mes", async () => {
    expect(await insertar(esc, "2026-10-01", await partida(esc, "2026-10-31"))).toBeNull();
  });

  it("el período es el primer día del mes y es único por empresa", async () => {
    expect(await insertar(esc, "2026-09-15", await partida(esc, "2026-09-30"))).toMatch(/periodo_inicio_mes/);
    expect(await insertar(esc, "2026-10-01", await partida(esc, "2026-10-31"))).toMatch(
      /liquidaciones_iva_empresa_periodo_unq/,
    );
  });

  it("la partida debe ser de la misma empresa, de origen liquidacion_iva y del último día del mes", async () => {
    expect(await insertar(esc, "2026-08-01", await partida(otra, "2026-08-31"))).toMatch(
      /no pertenece a la empresa/,
    );
    expect(await insertar(esc, "2026-08-01", await partida(esc, "2026-08-15"))).toMatch(/último día del mes/);
    expect(await insertar(esc, "2026-08-01", await partida(esc, "2026-08-31", "manual"))).toMatch(
      /origen «liquidacion_iva»/,
    );
  });

  it("rechaza importes negativos", async () => {
    const p = await partida(esc, "2026-07-31");
    expect(
      await errorDe(
        c,
        `insert into liquidaciones_iva (id, empresa_id, periodo, debito_fiscal, credito_fiscal, percibido_sufrido, retenido_sufrido,
           remanente_anterior, iva_por_pagar, remanente_credito, remanente_percibido, remanente_retenido, partida_id)
         values ($1, $2, '2026-07-01', 100, 60, 0, 0, 0, -1, 0, 0, 0, $3)`,
        [p.id, esc.empresaId, p.partidaId],
      ),
    ).toMatch(/importes_no_negativos/);
  });

  it("la partida debe apuntar a la liquidación (origen_id)", async () => {
    const ajena = await partida(esc, "2026-03-31", "liquidacion_iva", randomUUID());
    expect(await insertar(esc, "2026-03-01", { id: randomUUID(), partidaId: ajena.partidaId })).toMatch(
      /apuntar a esta liquidación/,
    );
    const sinOrigenId = await crearPartida(c, esc, "2026-03-31", [
      [esc.cuentas["2109"]!, "100", "0"],
      [esc.cuentas["1112"]!, "0", "100"],
    ]);
    await c.query(`update partidas set origen = 'liquidacion_iva' where id = $1`, [sinOrigenId]);
    expect(await insertar(esc, "2026-03-01", { id: randomUUID(), partidaId: sinOrigenId })).toMatch(
      /apuntar a esta liquidación/,
    );
  });

  const presentar = `update liquidaciones_iva set presentada_en = now(), presentada_por = $2 where partida_id = $1`;

  it("solo se presenta con la partida contabilizada; presentada, no se modifica ni se elimina", async () => {
    const l = await partida(esc, "2026-06-30");
    expect(await insertar(esc, "2026-06-01", l)).toBeNull();
    expect(await errorDe(c, presentar, [l.partidaId, usuarioId])).toMatch(/debe estar contabilizada/);
    await contabilizar(c, l.partidaId);
    expect(await errorDe(c, presentar, [l.partidaId, usuarioId])).toBeNull();
    expect(
      await errorDe(c, `update liquidaciones_iva set iva_por_pagar = 1 where partida_id = $1`, [l.partidaId]),
    ).toMatch(/ya presentada/);
    expect(await errorDe(c, `delete from liquidaciones_iva where partida_id = $1`, [l.partidaId])).toMatch(
      /ya presentada/,
    );
  });

  it("la presentación necesita fecha y usuario juntos", async () => {
    const l = await partida(esc, "2026-05-31");
    await insertar(esc, "2026-05-01", l);
    await contabilizar(c, l.partidaId);
    expect(
      await errorDe(c, `update liquidaciones_iva set presentada_en = now() where partida_id = $1`, [
        l.partidaId,
      ]),
    ).toMatch(/presentacion_completa/);
  });

  it("la partida solo se reemplaza cuando la anterior quedó anulada", async () => {
    const id = randomUUID();
    const vieja = await partida(esc, "2026-04-30", "liquidacion_iva", id);
    await insertar(esc, "2026-04-01", vieja);
    const nueva = await partida(esc, "2026-04-30", "liquidacion_iva", id);
    const reemplazar = `update liquidaciones_iva set partida_id = $2 where partida_id = $1`;
    expect(await errorDe(c, reemplazar, [vieja.partidaId, nueva.partidaId])).toMatch(
      /cuando la anterior fue anulada/,
    );
    await contabilizar(c, vieja.partidaId);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
      vieja.partidaId,
    ]);
    expect(await errorDe(c, reemplazar, [vieja.partidaId, nueva.partidaId])).toBeNull();
  });

  it("no se presenta si las líneas de la partida no coinciden con la liquidación", async () => {
    // La liquidación dice 40 por pagar y la partida editada lleva 55
    const l = await partida(esc, "2026-02-28", "liquidacion_iva", randomUUID(), "55");
    expect(await insertar(esc, "2026-02-01", l)).toBeNull();
    await contabilizar(c, l.partidaId);
    expect(await errorDe(c, presentar, [l.partidaId, usuarioId])).toMatch(/no coinciden con la liquidación/);
  });

  it("presentado el F-07, la partida enlazada no se puede anular", async () => {
    const l = await partida(esc, "2026-01-31");
    await insertar(esc, "2026-01-01", l);
    await contabilizar(c, l.partidaId);
    expect(await errorDe(c, presentar, [l.partidaId, usuarioId])).toBeNull();
    expect(
      await errorDe(c, `update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
        l.partidaId,
      ]),
    ).toMatch(/ya presentada/);
  });

  it("sin presentar, la partida de la liquidación sí se puede anular", async () => {
    const l = await partida(esc, "2026-12-31");
    await insertar(esc, "2026-12-01", l);
    await contabilizar(c, l.partidaId);
    expect(
      await errorDe(c, `update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
        l.partidaId,
      ]),
    ).toBeNull();
  });

  it("registra los cambios en la bitácora", async () => {
    const r = await c.query(`select count(*)::int as n from bitacora where tabla = 'liquidaciones_iva'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
