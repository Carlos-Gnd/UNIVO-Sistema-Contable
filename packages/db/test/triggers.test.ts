// Pruebas SQL de los triggers (S1-T24): casos que no cubre reglas.test.ts.
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
let caja: string;
let ventas: string;

const USUARIO = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-111111-111-1");
  caja = esc.cuentas["110101"]!;
  ventas = esc.cuentas["5101"]!;
});
afterAll(async () => {
  await c?.end();
});

const cuadrada = (fecha: string, monto = "10") =>
  crearPartida(c, esc, fecha, [
    [caja, monto, "0"],
    [ventas, "0", monto],
  ]);

/** Ejecuta las sentencias en una transacción con app.usuario_id fijado, como lo hace comoUsuario. */
async function comoUsuario(usuario: string, ...sentencias: [string, unknown[]][]) {
  await c.query("begin");
  try {
    await c.query(`select set_config('app.usuario_id', $1, true)`, [usuario]);
    for (const [sql, params] of sentencias) await c.query(sql, params);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

describe("anulación de partidas", () => {
  it("exige el motivo y registra quién y cuándo anuló", async () => {
    const id = await cuadrada("2026-06-01");
    await contabilizar(c, id);
    expect(await errorDe(c, `update partidas set estado = 'anulada' where id = $1`, [id])).toMatch(/check/i);
    await comoUsuario(USUARIO, [
      `update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1`,
      [id],
    ]);
    const r = await c.query(
      `select anulado_por, anulado_en is not null as con_fecha from partidas where id = $1`,
      [id],
    );
    expect(r.rows[0]).toEqual({ anulado_por: USUARIO, con_fecha: true });
  });

  it("al anular no se pueden cambiar otros datos de la partida", async () => {
    const id = await cuadrada("2026-06-02");
    await contabilizar(c, id);
    expect(
      await errorDe(
        c,
        `update partidas set estado = 'anulada', motivo_anulacion = 'x', concepto = 'otro' where id = $1`,
        [id],
      ),
    ).toMatch(/solo se registra el motivo/i);
  });

  it("una partida anulada no admite cambios en sus datos ni en sus líneas", async () => {
    const id = await cuadrada("2026-06-03");
    await contabilizar(c, id);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Error' where id = $1`, [id]);
    expect(await errorDe(c, `update partidas set concepto = 'otro' where id = $1`, [id])).toMatch(/anulada/i);
    expect(
      await errorDe(c, `update partida_detalles set concepto = 'otro' where partida_id = $1`, [id]),
    ).toMatch(/anulada/i);
    expect(await errorDe(c, `delete from partidas where id = $1`, [id])).toMatch(
      /solo se eliminan borradores/i,
    );
  });

  it("una contabilizada no puede volver a borrador", async () => {
    const id = await cuadrada("2026-06-04");
    await contabilizar(c, id);
    expect(await errorDe(c, `update partidas set estado = 'borrador' where id = $1`, [id])).toMatch(
      /no puede volver a borrador/i,
    );
  });
});

describe("contabilización", () => {
  it("rechaza partidas con una sola línea o con total cero", async () => {
    const una = await crearPartida(c, esc, "2026-06-05", [[caja, "10", "0"]]);
    expect(await errorDe(c, `update partidas set estado = 'contabilizada' where id = $1`, [una])).toMatch(
      /no cuadra/i,
    );
    const vacia = await crearPartida(c, esc, "2026-06-05", []);
    expect(await errorDe(c, `update partidas set estado = 'contabilizada' where id = $1`, [vacia])).toMatch(
      /no cuadra/i,
    );
  });

  it("registra al usuario que creó y contabilizó la partida, y no deja reescribirlo", async () => {
    const id = await cuadrada("2026-06-06");
    await comoUsuario(USUARIO, [`update partidas set estado = 'contabilizada' where id = $1`, [id]]);
    const r = await c.query(
      `select contabilizado_por, contabilizado_en is not null as con_fecha from partidas where id = $1`,
      [id],
    );
    expect(r.rows[0]).toEqual({ contabilizado_por: USUARIO, con_fecha: true });
    await c.query(`update partidas set contabilizado_por = null, concepto = 'Corregido' where id = $1`, [id]);
    const d = await c.query(`select contabilizado_por, version from partidas where id = $1`, [id]);
    // editar una contabilizada conserva quién la contabilizó y sube la versión
    expect(d.rows[0]).toEqual({ contabilizado_por: USUARIO, version: 2 });
  });

  it("numera por tipo de partida cuando la empresa lo configura así", async () => {
    const t = await crearEscenario(c, "0614-121212-112-2", "por_tipo");
    const [tc, tv] = [t.cuentas["110101"]!, t.cuentas["5101"]!];
    const nueva = (tipo: string) =>
      crearPartida(
        c,
        t,
        "2026-02-10",
        [
          [tc, "1", "0"],
          [tv, "0", "1"],
        ],
        tipo,
      );
    const op1 = await contabilizar(c, await nueva("operacion"));
    const aj1 = await contabilizar(c, await nueva("ajuste"));
    const op2 = await contabilizar(c, await nueva("operacion"));
    expect(op1.rows[0]).toEqual({ numero: 1, ambito_numeracion: "2026-operacion" });
    expect(aj1.rows[0]).toEqual({ numero: 1, ambito_numeracion: "2026-ajuste" });
    expect(op2.rows[0]).toEqual({ numero: 2, ambito_numeracion: "2026-operacion" });
  });

  it("no acepta una sucursal de otra empresa", async () => {
    const otra = await crearEscenario(c, "0614-131313-113-3");
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2026-06-07')`,
        [esc.empresaId, otra.sucursalId],
      ),
    ).toMatch(/sucursal no pertenece/i);
  });
});

describe("borradores", () => {
  it("se pueden eliminar junto con sus líneas", async () => {
    const id = await crearPartida(c, esc, "2026-06-08", [[caja, "10", "0"]]);
    expect(await errorDe(c, `delete from partidas where id = $1`, [id])).toBeNull();
    const r = await c.query(`select count(*)::int as n from partida_detalles where partida_id = $1`, [id]);
    expect(r.rows[0].n).toBe(0);
  });

  it("una línea no puede moverse a otra partida", async () => {
    const a = await crearPartida(c, esc, "2026-06-09", [[caja, "10", "0"]]);
    const b = await crearPartida(c, esc, "2026-06-09", []);
    expect(
      await errorDe(c, `update partida_detalles set partida_id = $1 where partida_id = $2`, [b, a]),
    ).toMatch(/no puede moverse/i);
  });

  it("la línea siempre toma la empresa de su partida", async () => {
    const otra = await crearEscenario(c, "0614-141414-114-4");
    const id = await crearPartida(c, esc, "2026-06-10", []);
    await c.query(
      `insert into partida_detalles (partida_id, empresa_id, cuenta_id, debe, haber) values ($1, $2, $3, 5, 0)`,
      [id, otra.empresaId, caja],
    );
    const r = await c.query(`select empresa_id from partida_detalles where partida_id = $1`, [id]);
    expect(r.rows[0].empresa_id).toBe(esc.empresaId);
  });
});

describe("cuentas inactivas y con movimientos", () => {
  it("no se registran líneas nuevas en una cuenta inactiva, pero las existentes se pueden corregir", async () => {
    const e = await crearEscenario(c, "0614-151515-115-5");
    const [ec, ev] = [e.cuentas["110101"]!, e.cuentas["5101"]!];
    const id = await crearPartida(c, e, "2026-06-11", [
      [ec, "10", "0"],
      [ev, "0", "10"],
    ]);
    await c.query(`update cuentas set activa = false where id = $1`, [ec]);
    expect(
      await errorDe(
        c,
        `insert into partida_detalles (partida_id, cuenta_id, debe, haber) values ($1, $2, 1, 0)`,
        [id, ec],
      ),
    ).toMatch(/inactiva/i);
    expect(
      await errorDe(
        c,
        `update partida_detalles set concepto = 'Corregido' where partida_id = $1 and cuenta_id = $2`,
        [id, ec],
      ),
    ).toBeNull();
    expect(
      await errorDe(
        c,
        `update partida_detalles set cuenta_id = $1 where partida_id = $2 and cuenta_id = $3`,
        [ec, id, ev],
      ),
    ).toMatch(/inactiva/i);
  });

  it("no se crean subcuentas ni se cambia el código de una cuenta con movimientos", async () => {
    const e = await crearEscenario(c, "0614-161616-116-6");
    await crearPartida(c, e, "2026-06-12", [[e.cuentas["110101"]!, "10", "0"]]);
    expect(
      await errorDe(
        c,
        `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, '11010101', 'Caja 1', 'deudora', 'activo')`,
        [e.empresaId],
      ),
    ).toMatch(/tiene movimientos/i);
    expect(
      await errorDe(c, `update cuentas set codigo = '110102' where id = $1`, [e.cuentas["110101"]]),
    ).toMatch(/tiene movimientos/i);
  });
});

describe("fecha de actualización y bitácora", () => {
  it("actualiza actualizado_en en cada cambio", async () => {
    const antes = await c.query(`select actualizado_en from empresas where id = $1`, [esc.empresaId]);
    await c.query(`select pg_sleep(0.01)`);
    await c.query(`update empresas set telefono = '2661-1234' where id = $1`, [esc.empresaId]);
    const despues = await c.query(`select actualizado_en from empresas where id = $1`, [esc.empresaId]);
    expect(despues.rows[0].actualizado_en.getTime()).toBeGreaterThan(antes.rows[0].actualizado_en.getTime());
  });

  it("registra altas y bajas con sus datos", async () => {
    const id = await crearPartida(c, esc, "2026-06-13", []);
    await c.query(`delete from partidas where id = $1`, [id]);
    const r = await c.query(
      `select accion, datos_anteriores is not null as antes, datos_nuevos is not null as despues
       from bitacora where tabla = 'partidas' and registro_id = $1 order by id`,
      [id],
    );
    expect(r.rows).toEqual([
      { accion: "INSERT", antes: false, despues: true },
      { accion: "DELETE", antes: true, despues: false },
    ]);
  });
});
