import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

const USUARIO = "11111111-1111-4111-8111-111111111111";
let c: Awaited<ReturnType<typeof reiniciarBase>>;
let esc: Escenario;
let otra: Escenario;
let productoId: string;
let tomaId: string;

async function nuevaToma(empresaId: string, sucursalId: string): Promise<string> {
  const resultado = await c.query(
    "insert into tomas_fisicas (empresa_id, sucursal_id, fecha, creado_por) values ($1, $2, '2026-06-30', $3) returning id",
    [empresaId, sucursalId, USUARIO],
  );
  return resultado.rows[0].id as string;
}

async function transaccion<T>(fn: () => Promise<T>): Promise<T> {
  await c.query("begin");
  try {
    const resultado = await fn();
    await c.query("commit");
    return resultado;
  } catch (error) {
    await c.query("rollback");
    throw error;
  }
}

beforeAll(async () => {
  c = await reiniciarBase(await basePropia("contable_db_tomas_fisicas"));
  esc = await crearEscenario(c, "0614-680001-101-1");
  otra = await crearEscenario(c, "0614-680002-101-2");
  await c.query(
    "insert into usuarios (id, nombre, correo) values ($1, 'Contador de prueba', 'toma@test.local')",
    [USUARIO],
  );
  const producto = await c.query(
    "insert into productos (empresa_id, codigo, nombre) values ($1, 'TOMA-1', 'Producto contado') returning id",
    [esc.empresaId],
  );
  productoId = producto.rows[0].id as string;
  tomaId = await nuevaToma(esc.empresaId, esc.sucursalId);
});

afterAll(async () => {
  await c?.end();
});

describe("toma física de inventario (HU-68)", () => {
  it("crea el snapshot y permite capturar el conteo antes de aprobarlo", async () => {
    await c.query(
      "insert into tomas_fisicas_detalles (empresa_id, toma_fisica_id, producto_id, existencia_sistema, secuencia_sistema) values ($1, $2, $3, 4, 0)",
      [esc.empresaId, tomaId, productoId],
    );
    await c.query(
      "update tomas_fisicas_detalles set cantidad_contada = 3.5 where toma_fisica_id = $1 and producto_id = $2",
      [tomaId, productoId],
    );
    const fila = await c.query(
      "select existencia_sistema::text, cantidad_contada::text, secuencia_sistema::text, valor_final from tomas_fisicas_detalles where toma_fisica_id = $1",
      [tomaId],
    );
    expect(fila.rows).toEqual([
      { existencia_sistema: "4.0000", cantidad_contada: "3.5000", secuencia_sistema: "0", valor_final: null },
    ]);
    expect(
      await c.query("select relrowsecurity from pg_class where oid = 'tomas_fisicas'::regclass"),
    ).toMatchObject({ rows: [{ relrowsecurity: true }] });
    expect(
      await c.query("select relrowsecurity from pg_class where oid = 'tomas_fisicas_detalles'::regclass"),
    ).toMatchObject({ rows: [{ relrowsecurity: true }] });
  });

  it("impide mezclar empresas, abrir otra toma y editar el snapshot del kardex", async () => {
    const productoAjeno = await c.query(
      "insert into productos (empresa_id, codigo, nombre) values ($1, 'AJENO-1', 'Producto de otra empresa') returning id",
      [otra.empresaId],
    );
    expect(
      await errorDe(
        c,
        "insert into tomas_fisicas_detalles (empresa_id, toma_fisica_id, producto_id, existencia_sistema, secuencia_sistema) values ($1, $2, $3, 1, 0)",
        [esc.empresaId, tomaId, productoAjeno.rows[0].id],
      ),
    ).toMatch(/no pertenece a la empresa/i);
    expect(
      await errorDe(
        c,
        "insert into tomas_fisicas (empresa_id, sucursal_id, fecha, creado_por) values ($1, $2, '2026-06-30', $3)",
        [esc.empresaId, esc.sucursalId, USUARIO],
      ),
    ).toMatch(/tomas_fisicas_una_abierta_por_sucursal_unq/i);
    expect(
      await errorDe(
        c,
        "update tomas_fisicas_detalles set existencia_sistema = 99 where toma_fisica_id = $1",
        [tomaId],
      ),
    ).toMatch(/no se puede cambiar la existencia de sistema/i);
  });

  it("hace inmutable la toma aprobada y conserva el valor final una sola vez", async () => {
    const id = await transaccion(async () => {
      const nueva = await nuevaToma(otra.empresaId, otra.sucursalId);
      const producto = (
        await c.query(
          "insert into productos (empresa_id, codigo, nombre) values ($1, 'OTRA-2', 'Producto') returning id",
          [otra.empresaId],
        )
      ).rows[0].id as string;
      await c.query(
        "insert into tomas_fisicas_detalles (empresa_id, toma_fisica_id, producto_id, existencia_sistema, secuencia_sistema, cantidad_contada) values ($1, $2, $3, 0, 0, 0)",
        [otra.empresaId, nueva, producto],
      );
      await c.query(
        "update tomas_fisicas set estado = 'aprobada', aprobado_por = $2, aprobado_en = now() where id = $1",
        [nueva, USUARIO],
      );
      await c.query(
        "update tomas_fisicas_detalles set valor_faltante = 0, valor_sobrante = 0, valor_final = 12 where toma_fisica_id = $1 and producto_id = $2",
        [nueva, producto],
      );
      return nueva;
    });
    expect(
      await errorDe(c, "update tomas_fisicas_detalles set cantidad_contada = 4 where toma_fisica_id = $1", [
        id,
      ]),
    ).toMatch(/inmutable/i);
    expect(await errorDe(c, "delete from tomas_fisicas where id = $1", [id])).toMatch(/no se elimina/i);
  });
});
