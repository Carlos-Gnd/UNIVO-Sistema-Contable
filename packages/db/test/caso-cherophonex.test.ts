// Carga del caso CheroPhonex (HU-90, S2-T49): el script deja la empresa lista, con todas sus partidas contabilizadas.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, leerCaso, type CasoCargado } from "../src/casos/cherophonex";
import { reiniciarBase } from "./helpers";

let c: pg.Client;
let carga: CasoCargado;
const caso = leerCaso();

beforeAll(async () => {
  c = await reiniciarBase();
  carga = await cargarCasoCherophonex(c);
});
afterAll(async () => {
  await c?.end();
});

const una = async <T>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0] as T;

describe("el caso en el archivo", () => {
  it("tiene la apertura, las operaciones, los ajustes y el cierre del ejercicio", () => {
    const por = (tipo: string) => caso.partidas.filter((p) => p.tipo === tipo).length;
    expect([por("apertura"), por("operacion"), por("ajuste"), por("cierre")]).toEqual([1, 33, 6, 4]);
    expect(caso.partidas.map((p) => p.numero)).toEqual(Array.from({ length: 44 }, (_, i) => i + 1));
  });

  it("cada partida cuadra al centavo y usa cuentas que existen", () => {
    const debe = (p: (typeof caso.partidas)[number]) =>
      p.lineas.reduce((s, l) => s + Math.round(Number(l.debe) * 100), 0);
    const haber = (p: (typeof caso.partidas)[number]) =>
      p.lineas.reduce((s, l) => s + Math.round(Number(l.haber) * 100), 0);
    for (const p of caso.partidas) expect(debe(p), `partida ${p.numero}`).toBe(haber(p));
    for (const p of caso.partidas)
      for (const l of p.lineas) expect(carga.cuentas[l.cuenta], `${p.numero}: ${l.cuenta}`).toBeTruthy();
  });
});

describe("la empresa cargada", () => {
  it("es una persona natural con su casa matriz, su ejercicio 2026 y el catálogo de persona natural", async () => {
    expect(
      await una(`select nombre, tipo_contribuyente::text as tipo from empresas where id = $1`, [
        carga.empresaId,
      ]),
    ).toEqual({
      nombre: "CHERO PHONEX",
      tipo: "persona_natural",
    });
    expect(
      await una(`select count(*)::int as n from sucursales where empresa_id = $1 and es_matriz`, [
        carga.sucursalId ? carga.empresaId : "",
      ]),
    ).toEqual({ n: 1 });
    expect(
      await una(`select count(*)::int as n from periodos where empresa_id = $1`, [carga.empresaId]),
    ).toEqual({ n: 12 });
    // Retiros del titular (3108) solo existe en el catálogo de persona natural
    expect(
      await una(`select count(*)::int as n from cuentas where empresa_id = $1 and codigo = '3108'`, [
        carga.empresaId,
      ]),
    ).toEqual({ n: 1 });
  });

  it("crea las subcuentas del caso con la naturaleza y el tipo de su cuenta de mayor", async () => {
    expect(
      await una(`select count(*)::int as n from cuentas where empresa_id = $1 and codigo = any($2::text[])`, [
        carga.empresaId,
        caso.subcuentas.map((s) => s.codigo),
      ]),
    ).toEqual({
      n: caso.subcuentas.length,
    });
    expect(
      await una(
        `select h.naturaleza::text as naturaleza, h.tipo::text as tipo, h.cuenta_padre_id = p.id as con_padre
         from cuentas h join cuentas p on p.empresa_id = h.empresa_id and p.codigo = '4201'
         where h.empresa_id = $1 and h.codigo = '420101'`,
        [carga.empresaId],
      ),
    ).toEqual({ naturaleza: "deudora", tipo: "costos_gastos", con_padre: true });
  });

  it("deja las 44 partidas contabilizadas, con correlativo del 1 al 44 sin saltos y en orden de fecha", async () => {
    expect(
      await una(
        `select count(*)::int as n, min(numero) as primero, max(numero) as ultimo, count(distinct numero)::int as distintos, bool_and(estado = 'contabilizada') as todas from partidas where empresa_id = $1`,
        [carga.empresaId],
      ),
    ).toEqual({
      n: 44,
      primero: 1,
      ultimo: 44,
      distintos: 44,
      todas: true,
    });
    const orden = await c.query(
      `select numero, fecha::text as fecha from partidas where empresa_id = $1 order by numero`,
      [carga.empresaId],
    );
    const fechas = orden.rows.map((r) => r.fecha as string);
    expect(fechas).toEqual([...fechas].sort());
    expect(fechas[0]).toBe("2026-10-01");
    expect(fechas.at(-1)).toBe("2026-10-31");
  });

  it("en total, el debe y el haber de todas las líneas son iguales", async () => {
    const t = await una<{ debe: string; haber: string }>(
      `select sum(debe)::text as debe, sum(haber)::text as haber from partida_detalles where empresa_id = $1`,
      [carga.empresaId],
    );
    expect(t.debe).toBe(t.haber);
    expect(Number(t.debe)).toBeGreaterThan(0);
  });
});

describe("la carga es todo o nada", () => {
  it("si una partida usa una cuenta que no existe, no queda ninguna empresa a medias", async () => {
    const roto = structuredClone(caso);
    roto.empresa.nit = "0614-010190-999-9";
    roto.partidas[10]!.lineas[0]!.cuenta = "999999";
    await expect(cargarCasoCherophonex(c, roto)).rejects.toThrow(/999999/);
    expect(await una(`select count(*)::int as n from empresas where nit = $1`, [roto.empresa.nit])).toEqual({
      n: 0,
    });
  });
});
