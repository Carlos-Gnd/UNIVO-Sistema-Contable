// Kardex (migración 20261123000100_kardex, HU-65, S3-T79): orden, existencias, inmutabilidad y método de valuación.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;
let n = 0;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-010190-102-0");
});
afterAll(async () => {
  await c?.end();
});

const producto = async (empresaId: string, metodo: string | null = null) =>
  (
    await c.query(
      `insert into productos (empresa_id, codigo, nombre, metodo_valuacion) values ($1, $2, 'Producto', $3) returning id`,
      [empresaId, `P-${++n}`, metodo],
    )
  ).rows[0].id as string;

const mover = (
  p: string,
  tipo: "entrada" | "salida",
  cantidad: string,
  fecha: string,
  extra: { empresa?: string; sucursal?: string; costo?: string; unitario?: string } = {},
) =>
  errorDe(
    c,
    `insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      extra.empresa ?? esc.empresaId,
      extra.sucursal ?? esc.sucursalId,
      p,
      fecha,
      tipo,
      cantidad,
      extra.unitario ?? "10",
      extra.costo ?? "10",
    ],
  );

describe("movimientos de inventario", () => {
  it("registra entradas y salidas y no permite sacar más de lo que hay", async () => {
    const p = await producto(esc.empresaId);
    expect(await mover(p, "entrada", "10", "2026-10-01")).toBeNull();
    expect(await mover(p, "salida", "4", "2026-10-02")).toBeNull();
    expect(await mover(p, "salida", "7", "2026-10-03")).toMatch(/Existencia insuficiente: hay 6/);
    expect(await mover(p, "salida", "6", "2026-10-03")).toBeNull();
    expect(await mover(p, "salida", "0.0001", "2026-10-04")).toMatch(/Existencia insuficiente/);
  });

  it("las existencias se llevan por sucursal", async () => {
    const p = await producto(esc.empresaId);
    const otraSucursal = (
      await c.query(
        `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id`,
        [esc.empresaId],
      )
    ).rows[0].id as string;
    expect(await mover(p, "entrada", "5", "2026-10-01")).toBeNull();
    expect(await mover(p, "salida", "1", "2026-10-02", { sucursal: otraSucursal })).toMatch(
      /Existencia insuficiente/,
    );
  });

  it("exige el orden cronológico: no se registra un movimiento anterior al último", async () => {
    const p = await producto(esc.empresaId);
    expect(await mover(p, "entrada", "5", "2026-10-10")).toBeNull();
    expect(await mover(p, "entrada", "5", "2026-10-09")).toMatch(/anterior al último/);
    expect(await mover(p, "entrada", "5", "2026-10-10")).toBeNull();
  });

  it("no se modifican ni se borran, ni siquiera vaciando la tabla", async () => {
    const p = await producto(esc.empresaId);
    await mover(p, "entrada", "5", "2026-10-01");
    expect(
      await errorDe(c, `update movimientos_inventario set cantidad = 9 where producto_id = $1`, [p]),
    ).toMatch(/no se modifican ni se borran/);
    expect(await errorDe(c, `delete from movimientos_inventario where producto_id = $1`, [p])).toMatch(
      /no se modifican ni se borran/,
    );
    // Con las series (HU-66) la tabla está referenciada por una llave foránea: el vaciado lo frena ella o el trigger
    expect(await errorDe(c, `truncate movimientos_inventario`)).toMatch(
      /no se modifican ni se borran|cannot truncate a table referenced/,
    );
  });

  it("el producto y la sucursal deben ser de la empresa del movimiento", async () => {
    const ajeno = await producto(otra.empresaId);
    expect(await mover(ajeno, "entrada", "1", "2026-10-01")).toMatch(/no pertenece a la empresa/);
    const propio = await producto(esc.empresaId);
    expect(await mover(propio, "entrada", "1", "2026-10-01", { sucursal: otra.sucursalId })).toMatch(
      /sucursal no pertenece/,
    );
  });

  it("la cantidad es positiva y los costos no son negativos", async () => {
    const p = await producto(esc.empresaId);
    expect(await mover(p, "entrada", "0", "2026-10-01")).toMatch(/cantidad_positiva/);
    expect(await mover(p, "entrada", "1", "2026-10-01", { costo: "-1" })).toMatch(/costos_no_negativos/);
  });

  it("asigna una secuencia creciente y registra la bitácora de cada movimiento", async () => {
    const p = await producto(esc.empresaId);
    await mover(p, "entrada", "1", "2026-10-01");
    await mover(p, "entrada", "1", "2026-10-01");
    const filas = (
      await c.query(
        `select secuencia from movimientos_inventario where producto_id = $1 order by secuencia`,
        [p],
      )
    ).rows;
    expect(Number(filas[1].secuencia)).toBeGreaterThan(Number(filas[0].secuencia));
    const bitacora = await c.query(
      `select 1 from bitacora where empresa_id = $1 and tabla = 'movimientos_inventario'`,
      [esc.empresaId],
    );
    expect(bitacora.rows.length).toBeGreaterThan(0);
  });
});

describe("método de valuación del producto", () => {
  it("se puede cambiar mientras no haya movimientos y queda fijo después", async () => {
    const p = await producto(esc.empresaId, "peps");
    expect(
      await errorDe(c, `update productos set metodo_valuacion = 'promedio_ponderado' where id = $1`, [p]),
    ).toBeNull();
    await mover(p, "entrada", "5", "2026-10-01");
    expect(await errorDe(c, `update productos set metodo_valuacion = 'peps' where id = $1`, [p])).toMatch(
      /ya tiene movimientos/,
    );
    // otros cambios del producto siguen permitidos
    expect(await errorDe(c, `update productos set nombre = 'Otro' where id = $1`, [p])).toBeNull();
  });

  it("la existencia mínima no puede ser negativa", async () => {
    expect(
      await errorDe(
        c,
        `insert into productos (empresa_id, codigo, nombre, existencia_minima) values ($1, 'NEG', 'X', -1)`,
        [esc.empresaId],
      ),
    ).toMatch(/existencia_minima_no_negativa/);
  });
});
