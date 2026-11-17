// Parámetros contables de la empresa (migración 20261117000000_parametros_empresa, HU-12, S2-T01).
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

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
});
afterAll(async () => {
  await c?.end();
});

const parametros = async (empresaId = esc.empresaId) =>
  (
    await c.query(
      `select modo_numeracion, formato_estados, metodo_valuacion, sistema_inventario from empresas where id = $1`,
      [empresaId],
    )
  ).rows[0];

const cambiar = (columna: string, valor: string, empresaId = esc.empresaId) =>
  errorDe(c, `update empresas set ${columna} = $1 where id = $2`, [valor, empresaId]);

const borrador = (empresaId: Escenario = esc) =>
  crearPartida(c, empresaId, "2026-11-10", [
    [empresaId.cuentas["110101"]!, "10", "0"],
    [empresaId.cuentas["5101"]!, "0", "10"],
  ]);

describe("valores por defecto", () => {
  it("una empresa nueva usa formato de clase, promedio ponderado y sistema perpetuo", async () => {
    expect(await parametros()).toEqual({
      modo_numeracion: "anual",
      formato_estados: "clase",
      metodo_valuacion: "promedio_ponderado",
      sistema_inventario: "perpetuo",
    });
  });

  it("rechaza valores fuera del catálogo", async () => {
    expect(await cambiar("formato_estados", "otro")).toMatch(/formato_estados/);
    expect(await cambiar("metodo_valuacion", "ueps")).toMatch(/metodo_valuacion/);
    expect(await cambiar("sistema_inventario", "mixto")).toMatch(/sistema_inventario/);
  });
});

describe("sin movimientos", () => {
  it("todos los parámetros se pueden cambiar, aunque haya borradores", async () => {
    await borrador();
    expect(await cambiar("modo_numeracion", "mensual")).toBeNull();
    expect(await cambiar("metodo_valuacion", "peps")).toBeNull();
    expect(await cambiar("sistema_inventario", "analitico")).toBeNull();
    expect(await cambiar("formato_estados", "niif_pymes")).toBeNull();
    expect(await parametros()).toEqual({
      modo_numeracion: "mensual",
      formato_estados: "niif_pymes",
      metodo_valuacion: "peps",
      sistema_inventario: "analitico",
    });
  });
});

describe("con movimientos", () => {
  let conMovimientos: Escenario;

  beforeAll(async () => {
    conMovimientos = await crearEscenario(c, "1234-567890-123-0");
    await contabilizar(c, await borrador(conMovimientos));
  });

  it("bloquea la numeración, el método de valuación y el sistema de inventario", async () => {
    const id = conMovimientos.empresaId;
    expect(await cambiar("modo_numeracion", "mensual", id)).toMatch(
      /ya tiene movimientos: no se puede cambiar modo_numeracion/,
    );
    expect(await cambiar("metodo_valuacion", "peps", id)).toMatch(/metodo_valuacion/);
    expect(await cambiar("sistema_inventario", "analitico", id)).toMatch(/sistema_inventario/);
    expect((await parametros(id)).modo_numeracion).toBe("anual");
  });

  it("indica todos los parámetros bloqueados que se intentaron cambiar", async () => {
    expect(
      await errorDe(
        c,
        `update empresas set metodo_valuacion = 'peps', sistema_inventario = 'analitico' where id = $1`,
        [conMovimientos.empresaId],
      ),
    ).toMatch(/metodo_valuacion, sistema_inventario/);
  });

  it("deja cambiar el formato de los estados y los demás datos de la empresa", async () => {
    const id = conMovimientos.empresaId;
    expect(await cambiar("formato_estados", "niif_pymes", id)).toBeNull();
    expect(await errorDe(c, `update empresas set nombre = 'Otro nombre' where id = $1`, [id])).toBeNull();
    // volver a guardar el mismo valor no cuenta como cambio
    expect(await cambiar("modo_numeracion", "anual", id)).toBeNull();
  });

  it("una partida anulada también cuenta como movimiento", async () => {
    const otra = await crearEscenario(c, "0614-010190-102-0");
    const id = await borrador(otra);
    await contabilizar(c, id);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1`, [
      id,
    ]);
    expect(await cambiar("modo_numeracion", "mensual", otra.empresaId)).toMatch(/ya tiene movimientos/);
  });

  it("los movimientos de una empresa no bloquean a otra", async () => {
    const libre = await crearEscenario(c, "0614-010190-103-5");
    expect(await cambiar("modo_numeracion", "por_tipo", libre.empresaId)).toBeNull();
  });
});

describe("bitácora", () => {
  it("registra el cambio de un parámetro con el valor anterior y el nuevo", async () => {
    const libre = await crearEscenario(c, "0614-010190-104-0");
    await cambiar("formato_estados", "niif_pymes", libre.empresaId);
    const r = await c.query(
      `select datos_anteriores ->> 'formato_estados' as antes, datos_nuevos ->> 'formato_estados' as despues
       from bitacora where tabla = 'empresas' and registro_id = $1 and accion = 'UPDATE' order by id desc limit 1`,
      [libre.empresaId],
    );
    expect(r.rows[0]).toEqual({ antes: "clase", despues: "niif_pymes" });
  });
});
