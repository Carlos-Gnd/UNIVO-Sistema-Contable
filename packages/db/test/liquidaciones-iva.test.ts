// Liquidación mensual del IVA del F-07 (migración 20261202000000_liquidaciones_iva, HU-48, S3-T43).
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

/** Partida en borrador con origen de liquidación del IVA. */
async function partida(e: Escenario, fecha: string, origen = "liquidacion_iva"): Promise<string> {
  const id = await crearPartida(c, e, fecha, [
    [e.cuentas["110101"]!, "10", "0"],
    [e.cuentas["5101"]!, "0", "10"],
  ]);
  await c.query(`update partidas set origen = $2 where id = $1`, [id, origen]);
  return id;
}

const insertar = (e: Escenario, periodo: string, partidaId: string) =>
  errorDe(
    c,
    `insert into liquidaciones_iva (empresa_id, periodo, debito_fiscal, credito_fiscal, percibido_sufrido, retenido_sufrido,
       remanente_anterior, iva_por_pagar, remanente_credito, remanente_percibido, remanente_retenido, partida_id)
     values ($1, $2, 100, 60, 0, 0, 0, 40, 0, 0, 0, $3)`,
    [e.empresaId, periodo, partidaId],
  );

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "1234-567890-123-0");
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
        `insert into liquidaciones_iva (empresa_id, periodo, debito_fiscal, credito_fiscal, percibido_sufrido, retenido_sufrido,
           remanente_anterior, iva_por_pagar, remanente_credito, remanente_percibido, remanente_retenido, partida_id)
         values ($1, '2026-07-01', 100, 60, 0, 0, 0, -1, 0, 0, 0, $2)`,
        [esc.empresaId, p],
      ),
    ).toMatch(/importes_no_negativos/);
  });

  it("solo se presenta con la partida contabilizada; presentada, no se modifica ni se elimina", async () => {
    const id = await partida(esc, "2026-06-30");
    expect(await insertar(esc, "2026-06-01", id)).toBeNull();
    const presentar = `update liquidaciones_iva set presentada_en = now(), presentada_por = $2 where partida_id = $1`;
    expect(await errorDe(c, presentar, [id, usuarioId])).toMatch(/debe estar contabilizada/);
    await contabilizar(c, id);
    expect(await errorDe(c, presentar, [id, usuarioId])).toBeNull();
    expect(
      await errorDe(c, `update liquidaciones_iva set iva_por_pagar = 1 where partida_id = $1`, [id]),
    ).toMatch(/ya presentada/);
    expect(await errorDe(c, `delete from liquidaciones_iva where partida_id = $1`, [id])).toMatch(
      /ya presentada/,
    );
  });

  it("la presentación necesita fecha y usuario juntos", async () => {
    const id = await partida(esc, "2026-05-31");
    await insertar(esc, "2026-05-01", id);
    await contabilizar(c, id);
    expect(
      await errorDe(c, `update liquidaciones_iva set presentada_en = now() where partida_id = $1`, [id]),
    ).toMatch(/presentacion_completa/);
  });

  it("la partida solo se reemplaza cuando la anterior quedó anulada", async () => {
    const vieja = await partida(esc, "2026-04-30");
    await insertar(esc, "2026-04-01", vieja);
    const nueva = await partida(esc, "2026-04-30");
    const reemplazar = `update liquidaciones_iva set partida_id = $2 where partida_id = $1`;
    expect(await errorDe(c, reemplazar, [vieja, nueva])).toMatch(/cuando la anterior fue anulada/);
    await contabilizar(c, vieja);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
      vieja,
    ]);
    expect(await errorDe(c, reemplazar, [vieja, nueva])).toBeNull();
  });

  it("registra los cambios en la bitácora", async () => {
    const r = await c.query(`select count(*)::int as n from bitacora where tabla = 'liquidaciones_iva'`);
    expect(r.rows[0].n).toBeGreaterThan(0);
  });
});
