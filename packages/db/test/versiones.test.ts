// Historial de versiones de las partidas contabilizadas (migración 20261117000100_versiones_partida, HU-23, S2-T05).
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
});
afterAll(async () => {
  await c?.end();
});

const caja = () => esc.cuentas["110101"]!;
const ventas = () => esc.cuentas["5101"]!;

/** Partida contabilizada de caja contra ventas por el monto indicado. */
async function contabilizada(monto: string, fecha = "2026-11-10"): Promise<string> {
  const id = await crearPartida(c, esc, fecha, [
    [caja(), monto, "0"],
    [ventas(), "0", monto],
  ]);
  await contabilizar(c, id);
  return id;
}

/** Cambia las líneas de la partida por una sola pareja caja/ventas del monto indicado. */
async function reemplazarLineas(id: string, monto: string) {
  await c.query(`delete from partida_detalles where partida_id = $1`, [id]);
  await c.query(
    `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, $4, 0, 0), ($1, $3, 0, $4, 1)`,
    [id, caja(), ventas(), monto],
  );
}

/** Edita en una transacción, como lo hará la API; con orden "lineas" se cambian primero las líneas. */
async function editar(
  id: string,
  monto: string,
  concepto: string,
  orden: "cabecera" | "lineas" = "cabecera",
) {
  await c.query("begin");
  try {
    await c.query(`select set_config('app.usuario_id', $1, true)`, [USUARIO]);
    if (orden === "lineas") {
      await reemplazarLineas(id, monto);
      await c.query(`update partidas set concepto = $2 where id = $1`, [id, concepto]);
    } else {
      await c.query(`update partidas set concepto = $2 where id = $1`, [id, concepto]);
      await reemplazarLineas(id, monto);
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

const versiones = async (id: string) =>
  (
    await c.query(
      `select version, datos ->> 'concepto' as concepto, lineas, reemplazada_por from partida_versiones
       where partida_id = $1 order by version`,
      [id],
    )
  ).rows as {
    version: number;
    concepto: string | null;
    lineas: Record<string, string>[];
    reemplazada_por: string | null;
  }[];

const versionActual = async (id: string) =>
  (await c.query(`select version from partidas where id = $1`, [id])).rows[0].version as number;

describe("edición de una partida contabilizada", () => {
  it("guarda la versión anterior con su cabecera, sus líneas y quién la editó", async () => {
    const id = await contabilizada("100.00");
    await editar(id, "120.50", "Corrección");

    const guardadas = await versiones(id);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({ version: 1, concepto: "Prueba", reemplazada_por: USUARIO });
    expect(guardadas[0]!.lineas).toEqual([
      {
        cuenta_id: caja(),
        codigo: "110101",
        nombre: "Caja general",
        concepto: null,
        debe: "100.00",
        haber: "0.00",
        orden: 0,
      },
      {
        cuenta_id: ventas(),
        codigo: "5101",
        nombre: "Ventas",
        concepto: null,
        debe: "0.00",
        haber: "100.00",
        orden: 1,
      },
    ]);
    expect(await versionActual(id)).toBe(2);
    expect((await c.query(`select concepto from partidas where id = $1`, [id])).rows[0].concepto).toBe(
      "Corrección",
    );
  });

  it("guarda lo mismo si primero se cambian las líneas y después la cabecera", async () => {
    const id = await contabilizada("80.00");
    await editar(id, "90.00", "Otro concepto", "lineas");

    const guardadas = await versiones(id);
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({ version: 1, concepto: "Prueba" });
    expect(guardadas[0]!.lineas.map((l) => l.debe)).toEqual(["80.00", "0.00"]);
  });

  it("una sola versión por transacción aunque se toquen muchas líneas", async () => {
    const id = await contabilizada("10.00");
    await c.query("begin");
    await c.query(`update partidas set concepto = 'Uno' where id = $1`, [id]);
    await c.query(`update partida_detalles set concepto = 'a' where partida_id = $1`, [id]);
    await c.query(`update partida_detalles set concepto = 'b' where partida_id = $1`, [id]);
    await c.query("commit");
    expect(await versiones(id)).toHaveLength(1);
  });

  it("cada edición confirmada agrega una versión con el estado que tenía antes", async () => {
    const id = await contabilizada("100.00");
    await editar(id, "200.00", "Segunda");
    await editar(id, "300.00", "Tercera");

    const guardadas = await versiones(id);
    expect(guardadas.map((v) => [v.version, v.concepto, v.lineas[0]!.debe])).toEqual([
      [1, "Prueba", "100.00"],
      [2, "Segunda", "200.00"],
    ]);
    expect(await versionActual(id)).toBe(3);
  });

  it("una edición que se revierte no deja versiones", async () => {
    const id = await contabilizada("50.00");
    await c.query("begin");
    await c.query(`update partidas set concepto = 'Cambio' where id = $1`, [id]);
    await c.query("rollback");
    expect(await versiones(id)).toEqual([]);
    expect(await versionActual(id)).toBe(1);
  });
});

describe("lo que no es una edición", () => {
  it("borradores, contabilizar y anular no crean versiones", async () => {
    const borrador = await crearPartida(c, esc, "2026-11-11", [
      [caja(), "5", "0"],
      [ventas(), "0", "5"],
    ]);
    await c.query(`update partidas set concepto = 'Editado en borrador' where id = $1`, [borrador]);
    await reemplazarLineas(borrador, "6.00");
    await contabilizar(c, borrador);
    expect(await versiones(borrador)).toEqual([]);

    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1`, [
      borrador,
    ]);
    expect(await versiones(borrador)).toEqual([]);
  });

  it("una partida creada ya contabilizada, con sus líneas en la misma transacción, no crea versiones", async () => {
    await c.query("begin");
    const p = await c.query(
      `insert into partidas (empresa_id, sucursal_id, fecha, concepto, estado) values ($1, $2, '2026-11-12', 'Directa', 'contabilizada') returning id`,
      [esc.empresaId, esc.sucursalId],
    );
    const id = p.rows[0].id as string;
    await reemplazarLineas(id, "7.00");
    await c.query("commit");
    expect(await versiones(id)).toEqual([]);
    expect(await versionActual(id)).toBe(1);
  });
});

describe("períodos cerrados y partidas anuladas", () => {
  it("la edición en un período cerrado se rechaza y no deja versiones", async () => {
    const id = await contabilizada("10.00", "2026-09-10");
    await c.query(`update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 9`, [
      esc.empresaId,
    ]);

    expect(await errorDe(c, `update partidas set concepto = 'Cambio' where id = $1`, [id])).toMatch(
      /cerrado/i,
    );
    expect(await errorDe(c, `delete from partida_detalles where partida_id = $1`, [id])).toMatch(/cerrado/i);
    expect(await versiones(id)).toEqual([]);
  });

  it("una partida anulada no admite cambios ni crea versiones", async () => {
    const id = await contabilizada("10.00");
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Error' where id = $1`, [id]);
    expect(
      await errorDe(c, `update partida_detalles set concepto = 'x' where partida_id = $1`, [id]),
    ).toMatch(/anulada/i);
    expect(await versiones(id)).toEqual([]);
  });
});

describe("el historial es inmutable", () => {
  it("no se modifica, borra ni vacía", async () => {
    const id = await contabilizada("10.00");
    await editar(id, "11.00", "Cambio");
    expect(await errorDe(c, `update partida_versiones set version = 9 where partida_id = $1`, [id])).toMatch(
      /inmutable/,
    );
    expect(await errorDe(c, `delete from partida_versiones where partida_id = $1`, [id])).toMatch(
      /inmutable/,
    );
    expect(await errorDe(c, `truncate partida_versiones`)).toMatch(/inmutable/);
    expect(await versiones(id)).toHaveLength(1);
  });

  it("la partida con historial no se puede borrar", async () => {
    const id = await contabilizada("10.00");
    await editar(id, "11.00", "Cambio");
    expect(await errorDe(c, `delete from partidas where id = $1`, [id])).toMatch(/borradores/);
  });
});
