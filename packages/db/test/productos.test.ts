// Productos y categorías (migración 20261123000000_productos, HU-64, S3-T76).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-010190-102-0");
});
afterAll(async () => {
  await c?.end();
});

const categoria = async (empresaId: string, nombre: string) =>
  (
    await c.query(`insert into categorias_producto (empresa_id, nombre) values ($1, $2) returning id`, [
      empresaId,
      nombre,
    ])
  ).rows[0].id as string;

const insertarProducto = (
  empresaId: string,
  codigo: string,
  extra: { categoria?: string; precio?: string } = {},
) =>
  errorDe(
    c,
    `insert into productos (empresa_id, categoria_id, codigo, nombre, precio_venta) values ($1, $2, $3, 'Producto', $4)`,
    [empresaId, extra.categoria ?? null, codigo, extra.precio ?? "10"],
  );

describe("productos", () => {
  it("el código es único por empresa pero se puede repetir en otra", async () => {
    expect(await insertarProducto(esc.empresaId, "P-1")).toBeNull();
    expect(await insertarProducto(esc.empresaId, "P-1")).toMatch(/productos_empresa_id_codigo_key/);
    expect(await insertarProducto(otra.empresaId, "P-1")).toBeNull();
  });

  it("el código solo admite letras, dígitos y . _ -", async () => {
    expect(await insertarProducto(esc.empresaId, "con espacio")).toMatch(/productos_codigo_formato/);
    expect(await insertarProducto(esc.empresaId, "A.b_c-9")).toBeNull();
  });

  it("el precio de venta no puede ser negativo", async () => {
    expect(await insertarProducto(esc.empresaId, "P-NEG", { precio: "-1" })).toMatch(
      /productos_precio_no_negativo/,
    );
  });

  it("la categoría debe ser de la misma empresa", async () => {
    const deOtra = await categoria(otra.empresaId, "Accesorios");
    expect(await insertarProducto(esc.empresaId, "P-CAT", { categoria: deOtra })).toMatch(
      /productos_categoria_id_empresa_id_fkey/,
    );
    const propia = await categoria(esc.empresaId, "Accesorios");
    expect(await insertarProducto(esc.empresaId, "P-CAT", { categoria: propia })).toBeNull();
  });

  it("el nombre de la categoría es único por empresa", async () => {
    await categoria(esc.empresaId, "Teléfonos");
    expect(
      await errorDe(c, `insert into categorias_producto (empresa_id, nombre) values ($1, 'Teléfonos')`, [
        esc.empresaId,
      ]),
    ).toMatch(/categorias_producto_empresa_id_nombre_key/);
  });

  it("actualiza actualizado_en y registra la bitácora de cada cambio", async () => {
    const antes = (
      await c.query(`select actualizado_en from productos where empresa_id = $1 and codigo = 'P-1'`, [
        esc.empresaId,
      ])
    ).rows[0].actualizado_en as Date;
    await new Promise((r) => setTimeout(r, 20));
    await c.query(`update productos set nombre = 'Renombrado' where empresa_id = $1 and codigo = 'P-1'`, [
      esc.empresaId,
    ]);
    const despues = (
      await c.query(`select actualizado_en from productos where empresa_id = $1 and codigo = 'P-1'`, [
        esc.empresaId,
      ])
    ).rows[0].actualizado_en as Date;
    expect(despues.getTime()).toBeGreaterThan(antes.getTime());
    const acciones = (
      await c.query(
        `select accion from bitacora where empresa_id = $1 and tabla = 'productos' order by creado_en, id`,
        [esc.empresaId],
      )
    ).rows.map((f) => f.accion);
    expect(acciones).toContain("INSERT");
    expect(acciones).toContain("UPDATE");
  });
});
