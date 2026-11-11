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

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010101-101-1");
  caja = esc.cuentas["110101"]!;
  ventas = esc.cuentas["5101"]!;
});
afterAll(async () => {
  await c?.end();
});

describe("ejercicios y períodos", () => {
  it("al crear un ejercicio se generan sus 12 períodos abiertos", async () => {
    const r = await c.query(
      `select mes, fecha_inicio::text as ini, fecha_fin::text as fin, estado from periodos where empresa_id = $1 order by mes`,
      [esc.empresaId],
    );
    expect(r.rows).toHaveLength(12);
    expect(r.rows[1]).toMatchObject({ mes: 2, ini: "2026-02-01", fin: "2026-02-28", estado: "abierto" });
    expect(r.rows[11]).toMatchObject({ mes: 12, ini: "2026-12-01", fin: "2026-12-31" });
  });
});

describe("catálogo de cuentas", () => {
  it("calcula el nivel y la cuenta padre a partir del código", async () => {
    const r = await c.query(
      `select c.codigo, c.nivel, p.codigo as padre from cuentas c left join cuentas p on p.id = c.cuenta_padre_id
       where c.empresa_id = $1 and c.codigo in ('1', '11', '1101', '110101') order by c.codigo`,
      [esc.empresaId],
    );
    expect(r.rows).toEqual([
      { codigo: "1", nivel: 1, padre: null },
      { codigo: "11", nivel: 2, padre: "1" },
      { codigo: "1101", nivel: 3, padre: "11" },
      { codigo: "110101", nivel: 4, padre: "1101" },
    ]);
  });

  it("rechaza códigos con longitud inválida, con letras o sin cuenta padre", async () => {
    const ins = (codigo: string) =>
      errorDe(
        c,
        `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, 'X', 'deudora', 'activo')`,
        [esc.empresaId, codigo],
      );
    expect(await ins("110")).toMatch(/longitud/i);
    expect(await ins("11A1")).toMatch(/dígitos/i);
    expect(await ins("1902")).toMatch(/padre/i);
  });
});

describe("partidas", () => {
  it("asigna el período según la fecha", async () => {
    const id = await crearPartida(c, esc, "2026-10-15", [
      [caja, "100", "0"],
      [ventas, "0", "100"],
    ]);
    const r = await c.query(
      `select p.mes from partidas x join periodos p on p.id = x.periodo_id where x.id = $1`,
      [id],
    );
    expect(r.rows[0].mes).toBe(10);
  });

  it("permite guardar un borrador descuadrado pero no contabilizarlo", async () => {
    const id = await crearPartida(c, esc, "2026-10-16", [
      [caja, "100", "0"],
      [ventas, "0", "90"],
    ]);
    expect(await errorDe(c, `update partidas set estado = 'contabilizada' where id = $1`, [id])).toMatch(
      /no cuadra/i,
    );
  });

  it("contabiliza una partida cuadrada con correlativo anual sin saltos", async () => {
    const a = await crearPartida(c, esc, "2026-10-17", [
      [caja, "113.00", "0"],
      [ventas, "0", "113.00"],
    ]);
    const b = await crearPartida(c, esc, "2026-11-02", [
      [caja, "50.10", "0"],
      [ventas, "0", "50.10"],
    ]);
    const ra = await contabilizar(c, a);
    const rb = await contabilizar(c, b);
    expect(ra.rows[0]).toEqual({ numero: 1, ambito_numeracion: "2026" });
    expect(rb.rows[0]).toEqual({ numero: 2, ambito_numeracion: "2026" });
  });

  it("numera por mes cuando la empresa lo configura así", async () => {
    const m = await crearEscenario(c, "0614-020202-102-2", "mensual");
    const [mc, mv] = [m.cuentas["110101"]!, m.cuentas["5101"]!];
    const oct = await crearPartida(c, m, "2026-10-01", [
      [mc, "1", "0"],
      [mv, "0", "1"],
    ]);
    const nov = await crearPartida(c, m, "2026-11-01", [
      [mc, "1", "0"],
      [mv, "0", "1"],
    ]);
    expect((await contabilizar(c, oct)).rows[0]).toEqual({ numero: 1, ambito_numeracion: "2026-10" });
    expect((await contabilizar(c, nov)).rows[0]).toEqual({ numero: 1, ambito_numeracion: "2026-11" });
  });

  it("rechaza líneas con debe y haber a la vez o en cuentas que no son de último nivel", async () => {
    const id = await crearPartida(c, esc, "2026-10-18", []);
    expect(
      await errorDe(
        c,
        `insert into partida_detalles (partida_id, cuenta_id, debe, haber) values ($1, $2, 5, 5)`,
        [id, caja],
      ),
    ).toMatch(/check/i);
    expect(
      await errorDe(
        c,
        `insert into partida_detalles (partida_id, cuenta_id, debe, haber) values ($1, $2, 5, 0)`,
        [id, esc.cuentas["1101"]],
      ),
    ).toMatch(/último nivel/i);
  });

  it("no permite usar cuentas de otra empresa", async () => {
    const otra = await crearEscenario(c, "0614-030303-103-3");
    const id = await crearPartida(c, esc, "2026-10-19", []);
    expect(
      await errorDe(
        c,
        `insert into partida_detalles (partida_id, cuenta_id, debe, haber) values ($1, $2, 5, 0)`,
        [id, otra.cuentas["110101"]],
      ),
    ).toMatch(/otra empresa/i);
  });

  it("no permite descuadrar una partida contabilizada al editar sus líneas", async () => {
    const id = await crearPartida(c, esc, "2026-10-20", [
      [caja, "10", "0"],
      [ventas, "0", "10"],
    ]);
    await contabilizar(c, id);
    expect(
      await errorDe(c, `update partida_detalles set debe = 15 where partida_id = $1 and cuenta_id = $2`, [
        id,
        caja,
      ]),
    ).toMatch(/no cuadra/i);
  });

  it("no permite eliminar una partida contabilizada", async () => {
    const id = await crearPartida(c, esc, "2026-10-21", [
      [caja, "10", "0"],
      [ventas, "0", "10"],
    ]);
    await contabilizar(c, id);
    expect(await errorDe(c, `delete from partidas where id = $1`, [id])).toMatch(
      /solo se eliminan borradores/i,
    );
  });
});

describe("períodos cerrados", () => {
  it("no se cierra un período con borradores pendientes", async () => {
    await crearPartida(c, esc, "2026-03-05", [[caja, "10", "0"]]);
    expect(
      await errorDe(c, `update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 3`, [
        esc.empresaId,
      ]),
    ).toMatch(/borradores/i);
  });

  it("bloquea registrar, editar y contabilizar en un período cerrado", async () => {
    const id = await crearPartida(c, esc, "2026-04-10", [
      [caja, "10", "0"],
      [ventas, "0", "10"],
    ]);
    await contabilizar(c, id);
    await c.query(`update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 4`, [
      esc.empresaId,
    ]);
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2026-04-11')`,
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/cerrado/i);
    expect(await errorDe(c, `update partidas set concepto = 'cambio' where id = $1`, [id])).toMatch(
      /cerrado/i,
    );
    expect(
      await errorDe(c, `update partida_detalles set concepto = 'cambio' where partida_id = $1`, [id]),
    ).toMatch(/cerrado/i);
  });

  it("no acepta partidas en fechas sin ejercicio creado", async () => {
    expect(
      await errorDe(
        c,
        `insert into partidas (empresa_id, sucursal_id, fecha) values ($1, $2, '2030-01-01')`,
        [esc.empresaId, esc.sucursalId],
      ),
    ).toMatch(/no existe un período/i);
  });
});

describe("bitácora", () => {
  it("registra los cambios con el usuario de la sesión y los valores anteriores y nuevos", async () => {
    const usuario = "11111111-1111-4111-8111-111111111111";
    await c.query("begin");
    await c.query(`select set_config('app.usuario_id', $1, true)`, [usuario]);
    await c.query(`update cuentas set nombre = 'Caja chica' where id = $1`, [caja]);
    await c.query("commit");
    const r = await c.query(
      `select usuario_id, accion, empresa_id, datos_anteriores->>'nombre' as antes, datos_nuevos->>'nombre' as despues
       from bitacora where tabla = 'cuentas' and registro_id = $1 order by id desc limit 1`,
      [caja],
    );
    expect(r.rows[0]).toEqual({
      usuario_id: usuario,
      accion: "UPDATE",
      empresa_id: esc.empresaId,
      antes: "Caja general",
      despues: "Caja chica",
    });
  });

  it("no se puede modificar, borrar ni vaciar", async () => {
    expect(await errorDe(c, `update bitacora set accion = 'X'`)).toMatch(/inmutable/i);
    expect(await errorDe(c, `delete from bitacora`)).toMatch(/inmutable/i);
    expect(await errorDe(c, `truncate bitacora`)).toMatch(/inmutable/i);
  });
});
