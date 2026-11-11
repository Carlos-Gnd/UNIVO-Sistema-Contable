import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reiniciarBase } from "./helpers";

let c: pg.Client;
let natural: string;
let sociedad: string;

const crearEmpresa = async (nit: string, tipo: string) =>
  (
    await c.query(`insert into empresas (nombre, nit, tipo_contribuyente) values ($1, $2, $3) returning id`, [
      `Empresa ${nit}`,
      nit,
      tipo,
    ])
  ).rows[0].id as string;

const cuenta = async (empresa: string, codigo: string) =>
  (
    await c.query(
      `select c.nombre, c.naturaleza, c.tipo, c.nivel, p.codigo as padre
       from cuentas c left join cuentas p on p.id = c.cuenta_padre_id where c.empresa_id = $1 and c.codigo = $2`,
      [empresa, codigo],
    )
  ).rows[0];

beforeAll(async () => {
  c = await reiniciarBase();
  natural = await crearEmpresa("0614-111111-111-1", "persona_natural");
  sociedad = await crearEmpresa("0614-222222-222-2", "sociedad");
  await c.query(`select interno.copiar_catalogo_base($1)`, [natural]);
  await c.query(`select interno.copiar_catalogo_base($1)`, [sociedad]);
});
afterAll(async () => {
  await c?.end();
});

describe("catálogo empresarial precargado (HU-16)", () => {
  it("copia el catálogo completo con su jerarquía de seis niveles", async () => {
    const r = await c.query(
      `select nivel, count(*)::int as n from cuentas where empresa_id = $1 group by nivel order by nivel`,
      [sociedad],
    );
    const niveles = r.rows.map((x) => x.nivel);
    expect(niveles).toEqual([1, 2, 3, 4, 5]);
    expect(r.rows.find((x) => x.nivel === 1)?.n).toBe(6); // seis clases
    expect(await cuenta(sociedad, "11010301")).toMatchObject({ nivel: 5, padre: "110103" });
  });

  it("incluye las cuentas que usa el caso CheroPhonex", async () => {
    for (const codigo of [
      "110101",
      "110102",
      "110103",
      "1109",
      "1112",
      "1202",
      "2102",
      "2106",
      "2107",
      "2109",
      "2111",
      "3101",
      "3106",
      "4104",
      "4201",
      "4202",
      "4203",
      "5101",
      "6101",
    ]) {
      expect(await cuenta(natural, codigo), codigo).toBeDefined();
    }
    expect(await cuenta(natural, "4104")).toMatchObject({
      nombre: "Costo de Ventas",
      naturaleza: "deudora",
      padre: "41",
    });
  });

  it("asigna la naturaleza por clase e invierte las cuentas complementarias (R) y sus subcuentas", async () => {
    expect((await cuenta(sociedad, "110101")).naturaleza).toBe("deudora");
    expect((await cuenta(sociedad, "2109")).naturaleza).toBe("acreedora");
    expect((await cuenta(sociedad, "1202")).naturaleza).toBe("acreedora");
    expect((await cuenta(sociedad, "120201")).naturaleza).toBe("acreedora");
    expect((await cuenta(sociedad, "1104")).naturaleza).toBe("acreedora");
    expect((await cuenta(sociedad, "3107")).naturaleza).toBe("deudora");
    expect((await cuenta(sociedad, "5101")).naturaleza).toBe("acreedora");
    expect((await cuenta(sociedad, "6101")).tipo).toBe("liquidadora");
  });

  it("la variante de persona natural tiene retiros del titular y no tiene cuentas de sociedad", async () => {
    expect(await cuenta(natural, "3108")).toMatchObject({
      nombre: "Retiros del Titular",
      naturaleza: "deudora",
    });
    expect((await cuenta(natural, "3101")).nombre).toBe("Capital");
    for (const codigo of ["3102", "3103", "3104", "2108", "1106", "210502"]) {
      expect(await cuenta(natural, codigo), codigo).toBeUndefined();
    }
  });

  it("la variante de sociedad tiene capital social, reservas y dividendos, sin retiros del titular", async () => {
    expect((await cuenta(sociedad, "3101")).nombre).toBe("Capital Social");
    for (const codigo of ["3102", "3103", "3104", "2108"])
      expect(await cuenta(sociedad, codigo), codigo).toBeDefined();
    expect(await cuenta(sociedad, "3108")).toBeUndefined();
  });

  it("corrige las erratas del catálogo de clase (códigos repetidos o fuera de su cuenta)", async () => {
    expect(await cuenta(sociedad, "120204")).toMatchObject({ nombre: "Mobiliario y Equipo", padre: "1202" });
    expect(await cuenta(sociedad, "210202")).toMatchObject({ nombre: "Del Exterior", padre: "2102" });
    expect(await cuenta(sociedad, "210102")).toBeUndefined();
  });

  it("no se puede copiar dos veces en la misma empresa", async () => {
    await expect(c.query(`select interno.copiar_catalogo_base($1)`, [natural])).rejects.toThrow(
      /ya tiene cuentas/,
    );
  });
});
