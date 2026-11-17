// Cierre y reapertura de períodos (HU-32 y HU-33, S2-T39): un período cerrado no acepta partidas ni ediciones
// y el cierre y la reapertura quedan en la bitácora. Son reglas de la base, que valen para cualquier vía de acceso.
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
const USUARIO = "a1111111-1111-4111-8111-111111111111";

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Contador', 'contador@prueba.sv')", [
    USUARIO,
  ]);
});
afterAll(async () => {
  await c?.end();
});

const caja = () => esc.cuentas["110101"]!;
const ventas = () => esc.cuentas["5101"]!;

/** Ejecuta sentencias en una transacción a nombre del usuario, como lo hace la API (para la bitácora). */
async function comoUsuario(sentencias: [string, unknown[]?][]) {
  await c.query("begin");
  try {
    await c.query(`select set_config('app.usuario_id', $1, true)`, [USUARIO]);
    for (const [sql, params] of sentencias) await c.query(sql, params);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

const cuadrada = (fecha: string, monto = "10.00") =>
  crearPartida(c, esc, fecha, [
    [caja(), monto, "0"],
    [ventas(), "0", monto],
  ]);

const contabilizada = async (fecha: string) => {
  const id = await cuadrada(fecha);
  await contabilizar(c, id);
  return id;
};

const periodo = async (mes: number, empresaId = esc.empresaId) =>
  (
    await c.query(
      `select estado, cerrado_en is not null as con_fecha_de_cierre, motivo_reapertura from periodos where empresa_id = $1 and mes = $2`,
      [empresaId, mes],
    )
  ).rows[0] as { estado: string; con_fecha_de_cierre: boolean; motivo_reapertura: string | null };

const cerrar = (mes: number) =>
  comoUsuario([
    [`update periodos set estado = 'cerrado' where empresa_id = $1 and mes = $2`, [esc.empresaId, mes]],
  ]);

const reabrir = (mes: number, motivo: string) =>
  comoUsuario([
    [
      `update periodos set estado = 'abierto', motivo_reapertura = $3 where empresa_id = $1 and mes = $2`,
      [esc.empresaId, mes, motivo],
    ],
  ]);

describe("cierre del período", () => {
  it("no cierra si hay borradores y dice cuántos son; sin ellos cierra y registra la fecha", async () => {
    const borrador1 = await cuadrada("2026-01-10");
    await cuadrada("2026-01-20");
    expect(
      await errorDe(c, `update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 1`, [
        esc.empresaId,
      ]),
    ).toMatch(/tiene 2 borradores pendientes/);
    expect((await periodo(1)).estado).toBe("abierto");

    await c.query(`delete from partidas where id = $1`, [borrador1]);
    await contabilizar(
      c,
      (
        await c.query(
          `select id from partidas where periodo_id = (select id from periodos where empresa_id = $1 and mes = 1)`,
          [esc.empresaId],
        )
      ).rows[0].id,
    );
    await cerrar(1);
    expect(await periodo(1)).toMatchObject({ estado: "cerrado", con_fecha_de_cierre: true });
  });

  it("un período cerrado no acepta partidas nuevas, aunque estén en borrador", async () => {
    await contabilizada("2026-02-10");
    await cerrar(2);
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2026-02-15')`,
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/cerrado/i);
  });

  it("no permite editar una partida contabilizada ni sus líneas", async () => {
    const id = await contabilizada("2026-03-10");
    await cerrar(3);
    expect(await errorDe(c, `update partidas set concepto = 'cambio' where id = $1`, [id])).toMatch(
      /cerrado/i,
    );
    expect(
      await errorDe(c, `update partida_detalles set debe = 99 where partida_id = $1 and haber = 0`, [id]),
    ).toMatch(/cerrado/i);
    expect(await errorDe(c, `delete from partida_detalles where partida_id = $1`, [id])).toMatch(/cerrado/i);
    expect(
      await errorDe(
        c,
        `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, 1, 0, 9)`,
        [id, caja()],
      ),
    ).toMatch(/cerrado/i);
    expect(await errorDe(c, `update partidas set fecha = '2026-04-10' where id = $1`, [id])).toMatch(
      /cerrado/i,
    );
  });

  it("no se puede mover una partida de un período abierto a uno cerrado", async () => {
    const id = await contabilizada("2026-05-10");
    await cerrar(2);
    expect(await errorDe(c, `update partidas set fecha = '2026-02-20' where id = $1`, [id])).toMatch(
      /cerrado/i,
    );
  });

  it("anular sigue permitido: la reversión se registra en un período abierto", async () => {
    const id = await contabilizada("2026-06-10");
    await cerrar(6);
    expect(
      await errorDe(
        c,
        `update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1`,
        [id],
      ),
    ).toBeNull();
  });

  it("los demás períodos y las demás empresas no se afectan", async () => {
    expect(await cuadrada("2026-07-10")).toBeTruthy();
    const otra = await crearEscenario(c, "1234-567890-123-0");
    await crearPartida(c, otra, "2026-02-10", [
      [otra.cuentas["110101"]!, "5", "0"],
      [otra.cuentas["5101"]!, "0", "5"],
    ]);
    expect((await periodo(2, otra.empresaId)).estado).toBe("abierto");
  });
});

describe("el cierre y la reapertura quedan en la bitácora", () => {
  it("el cierre registra quién cerró y el cambio de estado", async () => {
    await contabilizada("2026-08-10");
    await cerrar(8);
    const r = await c.query(
      `select usuario_id::text as usuario, datos_anteriores ->> 'estado' as antes, datos_nuevos ->> 'estado' as despues
       from bitacora b join periodos p on p.id::text = b.registro_id
       where b.tabla = 'periodos' and b.accion = 'UPDATE' and p.empresa_id = $1 and p.mes = 8 order by b.id`,
      [esc.empresaId],
    );
    expect(r.rows).toEqual([{ usuario: USUARIO, antes: "abierto", despues: "cerrado" }]);
  });

  it("la reapertura exige un motivo distinto del anterior y queda registrada con su motivo", async () => {
    await contabilizada("2026-09-10");
    await cerrar(9);
    expect(
      await errorDe(c, `update periodos set estado = 'abierto' where empresa_id = $1 and mes = 9`, [
        esc.empresaId,
      ]),
    ).toMatch(/motivo de la reapertura/);
    expect(
      await errorDe(
        c,
        `update periodos set estado = 'abierto', motivo_reapertura = '   ' where empresa_id = $1 and mes = 9`,
        [esc.empresaId],
      ),
    ).toMatch(/motivo de la reapertura/);
    expect((await periodo(9)).estado).toBe("cerrado");

    await reabrir(9, "Falta registrar una factura");
    expect(await periodo(9)).toMatchObject({
      estado: "abierto",
      con_fecha_de_cierre: false,
      motivo_reapertura: "Falta registrar una factura",
    });

    const r = await c.query(
      `select usuario_id::text as usuario, datos_nuevos ->> 'estado' as despues, datos_nuevos ->> 'motivo_reapertura' as motivo
       from bitacora b join periodos p on p.id::text = b.registro_id
       where b.tabla = 'periodos' and b.accion = 'UPDATE' and p.empresa_id = $1 and p.mes = 9 order by b.id desc limit 1`,
      [esc.empresaId],
    );
    expect(r.rows[0]).toEqual({
      usuario: USUARIO,
      despues: "abierto",
      motivo: "Falta registrar una factura",
    });

    // una segunda reapertura no puede repetir el mismo motivo
    await cerrar(9);
    expect(
      await errorDe(
        c,
        `update periodos set estado = 'abierto', motivo_reapertura = 'Falta registrar una factura' where empresa_id = $1 and mes = 9`,
        [esc.empresaId],
      ),
    ).toMatch(/motivo de la reapertura/);
  });

  it("reabierto, el período vuelve a aceptar partidas", async () => {
    await contabilizada("2026-10-10");
    await cerrar(10);
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2026-10-15')`,
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/cerrado/i);
    await reabrir(10, "Corrección de saldos");
    expect(await cuadrada("2026-10-15")).toBeTruthy();
  });
});
