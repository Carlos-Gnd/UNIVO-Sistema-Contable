import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "./helpers";

const USUARIO = "11111111-1111-4111-8111-111111111111";
let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let otra: Escenario;
let codigo = 0;

async function nuevoProducto(empresaId: string, controlaSeries = true): Promise<string> {
  const r = await c.query(
    "insert into productos (empresa_id, codigo, nombre, controla_series) values ($1, $2, $3, $4) returning id",
    [empresaId, `SER-${++codigo}`, `Producto serial ${codigo}`, controlaSeries],
  );
  return r.rows[0].id as string;
}

async function transaccion<T>(fn: () => Promise<T>): Promise<T> {
  await c.query("begin");
  await c.query("select set_config('app.usuario_id', $1, true)", [USUARIO]);
  try {
    const resultado = await fn();
    await c.query("commit");
    return resultado;
  } catch (error) {
    await c.query("rollback");
    throw error;
  }
}

async function entrada(
  empresaId: string,
  sucursalId: string,
  producto: string,
  unidades: { numero: string; costo: string }[],
  costoTotal: string,
): Promise<string> {
  return transaccion(async () => {
    const movimiento = await c.query(
      "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-01', 'entrada', $4, $5, $6) returning id",
      [empresaId, sucursalId, producto, String(unidades.length), unidades[0]?.costo ?? "0.00", costoTotal],
    );
    const movimientoId = movimiento.rows[0].id as string;
    for (const unidad of unidades) {
      await c.query(
        "insert into series_inventario (empresa_id, sucursal_id, producto_id, numero_serie, costo_unitario, movimiento_entrada_id) values ($1, $2, $3, $4, $5, $6)",
        [empresaId, sucursalId, producto, unidad.numero, unidad.costo, movimientoId],
      );
    }
    return movimientoId;
  });
}

beforeAll(async () => {
  c = await reiniciarBase(await basePropia("contable_db_series_inventario"));
  esc = await crearEscenario(c, "0614-660001-101-1");
  otra = await crearEscenario(c, "0614-660002-101-2");
});

afterAll(async () => {
  await c?.end();
});

describe("series de inventario (HU-66)", () => {
  it("vincula entrada y salida una sola vez, conserva costo, bitácora y RLS", async () => {
    const productoId = await nuevoProducto(esc.empresaId);
    const entradaA = await entrada(
      esc.empresaId,
      esc.sucursalId,
      productoId,
      [{ numero: "imei-a", costo: "10.00" }],
      "10.00",
    );
    const entradaB = await entrada(
      esc.empresaId,
      esc.sucursalId,
      productoId,
      [{ numero: "imei-b", costo: "12.00" }],
      "12.00",
    );
    const salidaId = await transaccion(async () => {
      const salida = await c.query(
        "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-02', 'salida', 1, 12, 12) returning id",
        [esc.empresaId, esc.sucursalId, productoId],
      );
      const id = salida.rows[0].id as string;
      await c.query(
        "update series_inventario set movimiento_salida_id = $1 where empresa_id = $2 and numero_serie = 'IMEI-B'",
        [id, esc.empresaId],
      );
      return id;
    });

    const filas = await c.query(
      "select numero_serie, costo_unitario::text, movimiento_entrada_id, movimiento_salida_id from series_inventario where producto_id = $1 order by numero_serie",
      [productoId],
    );
    expect(filas.rows).toEqual([
      {
        numero_serie: "IMEI-A",
        costo_unitario: "10.00",
        movimiento_entrada_id: entradaA,
        movimiento_salida_id: null,
      },
      {
        numero_serie: "IMEI-B",
        costo_unitario: "12.00",
        movimiento_entrada_id: entradaB,
        movimiento_salida_id: salidaId,
      },
    ]);

    expect(
      await c.query("select costo_total::text from movimientos_inventario where id = $1", [salidaId]),
    ).toMatchObject({ rows: [{ costo_total: "12.00" }] });
    expect(
      await errorDe("update series_inventario set costo_unitario = 99 where numero_serie = 'IMEI-A'"),
    ).toMatch(/serie es inmutable/i);
    expect(
      await c.query(
        "select accion, usuario_id from bitacora where empresa_id = $1 and tabla = 'series_inventario'",
        [esc.empresaId],
      ),
    ).toMatchObject({
      rows: expect.arrayContaining([
        { accion: "INSERT", usuario_id: USUARIO },
        { accion: "UPDATE", usuario_id: USUARIO },
      ]),
    });

    const repetida = await errorEnTransaccion(async () => {
      const salida = await c.query(
        "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-03', 'salida', 1, 12, 12) returning id",
        [esc.empresaId, esc.sucursalId, productoId],
      );
      await c.query(
        "update series_inventario set movimiento_salida_id = $1 where id = (select id from series_inventario where numero_serie = 'IMEI-B')",
        [salida.rows[0].id],
      );
    });
    expect(repetida).toMatch(/solo se permite registrar una salida una vez/i);

    expect(await errorDe("delete from series_inventario where numero_serie = 'IMEI-A'")).toMatch(
      /no se borran/i,
    );
    const rls = await c.query(
      "select relrowsecurity from pg_class where oid = 'public.series_inventario'::regclass",
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const acceso = await c.query(
      "select rolname, has_table_privilege(oid, 'public.series_inventario', 'SELECT') as puede_leer from pg_roles where rolname in ('anon', 'authenticated') order by rolname",
    );
    expect(acceso.rows.every((rol) => rol.puede_leer === false)).toBe(true);
  });

  it("normaliza series y evita que se repitan dentro de la empresa", async () => {
    const otroProducto = await nuevoProducto(esc.empresaId);
    expect(
      await entrada(
        esc.empresaId,
        esc.sucursalId,
        otroProducto,
        [{ numero: "duplicate-a", costo: "3.00" }],
        "3.00",
      ),
    ).toBeTruthy();
    const tercera = await nuevoProducto(otra.empresaId);
    await entrada(
      otra.empresaId,
      otra.sucursalId,
      tercera,
      [{ numero: "duplicate-a", costo: "3.00" }],
      "3.00",
    );
    const duplicada = await errorEnTransaccion(async () => {
      const movimiento = await c.query(
        "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-01', 'entrada', 1, 3, 3) returning id",
        [esc.empresaId, esc.sucursalId, otroProducto],
      );
      await c.query(
        "insert into series_inventario (empresa_id, sucursal_id, producto_id, numero_serie, costo_unitario, movimiento_entrada_id) values ($1, $2, $3, 'DUPLICATE-A', 3, $4)",
        [esc.empresaId, esc.sucursalId, otroProducto, movimiento.rows[0].id],
      );
    });
    expect(duplicada).toMatch(/series_inventario_empresa_serie_unq/i);
  });

  it("exige una serie por unidad y que la suma de costos coincida con la entrada", async () => {
    const productoId = await nuevoProducto(esc.empresaId);
    const incompleto = await errorEnTransaccion(async () => {
      const movimiento = await c.query(
        "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-01', 'entrada', 2, 10, 20) returning id",
        [esc.empresaId, esc.sucursalId, productoId],
      );
      await c.query(
        "insert into series_inventario (empresa_id, sucursal_id, producto_id, numero_serie, costo_unitario, movimiento_entrada_id) values ($1, $2, $3, 'IMEI-INCOMPLETO', 20, $4)",
        [esc.empresaId, esc.sucursalId, productoId, movimiento.rows[0].id],
      );
    });
    expect(incompleto).toMatch(/una serie por cada unidad/i);

    const costoDistinto = await errorEnTransaccion(async () => {
      const movimiento = await c.query(
        "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-01', 'entrada', 2, 10, 20) returning id",
        [esc.empresaId, esc.sucursalId, productoId],
      );
      const id = movimiento.rows[0].id;
      await c.query(
        "insert into series_inventario (empresa_id, sucursal_id, producto_id, numero_serie, costo_unitario, movimiento_entrada_id) values ($1, $2, $3, 'IMEI-COSTO-A', 10, $4), ($1, $2, $3, 'IMEI-COSTO-B', 9, $4)",
        [esc.empresaId, esc.sucursalId, productoId, id],
      );
    });
    expect(costoDistinto).toMatch(/costo de entrada debe coincidir/i);
  });

  it("impide mezclar empresas y activar el control después de movimientos", async () => {
    const productoId = await nuevoProducto(esc.empresaId);
    const entradaId = await entrada(
      esc.empresaId,
      esc.sucursalId,
      productoId,
      [{ numero: "IMEI-AISLADO", costo: "1.00" }],
      "1.00",
    );
    const mezcla = await errorEnTransaccion(async () => {
      await c.query(
        "insert into series_inventario (empresa_id, sucursal_id, producto_id, numero_serie, costo_unitario, movimiento_entrada_id) values ($1, $2, $3, 'IMEI-AJENO', 1, $4)",
        [otra.empresaId, otra.sucursalId, productoId, entradaId],
      );
    });
    expect(mezcla).toMatch(/no controla series en esta empresa/i);

    const sinControl = await nuevoProducto(esc.empresaId, false);
    await c.query(
      "insert into movimientos_inventario (empresa_id, sucursal_id, producto_id, fecha, tipo, cantidad, costo_unitario, costo_total) values ($1, $2, $3, '2026-10-01', 'entrada', 1, 1, 1)",
      [esc.empresaId, esc.sucursalId, sinControl],
    );
    expect(await errorDe(`update productos set controla_series = true where id = '${sinControl}'`)).toMatch(
      /no se puede cambiar: el producto ya tiene movimientos/i,
    );
  });
});

async function errorEnTransaccion(fn: () => Promise<unknown>): Promise<string> {
  await c.query("begin");
  await c.query("select set_config('app.usuario_id', $1, true)", [USUARIO]);
  try {
    await fn();
    await c.query("commit");
    return "sin error";
  } catch (error) {
    await c.query("rollback");
    return (error as Error).message;
  }
}

async function errorDe(sql: string): Promise<string> {
  try {
    await c.query(sql);
    return "sin error";
  } catch (error) {
    return (error as Error).message;
  }
}
