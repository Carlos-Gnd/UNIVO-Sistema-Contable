// Clientes y proveedores (migración 20261129000000_terceros, HU-58, S3-T58 y S3-T60): NIT y NRC únicos por empresa.
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

const insertar = (
  empresaId: string,
  nit: string,
  nrc: string | null = null,
  extra: { cliente?: boolean; proveedor?: boolean; dias?: number } = {},
) =>
  errorDe(
    c,
    `insert into terceros (empresa_id, nombre, nit, nrc, es_cliente, es_proveedor, dias_credito)
     values ($1, 'Tercero de prueba', $2, $3, $4, $5, $6)`,
    [empresaId, nit, nrc, extra.cliente ?? true, extra.proveedor ?? false, extra.dias ?? 0],
  );

describe("terceros", () => {
  it("el NIT y el NRC no se repiten dentro de la empresa pero sí entre empresas", async () => {
    expect(await insertar(esc.empresaId, "1234-567890-123-0", "245871-4")).toBeNull();
    expect(await insertar(esc.empresaId, "1234-567890-123-0", "111111-1")).toMatch(
      /terceros_empresa_id_nit_key/,
    );
    expect(await insertar(esc.empresaId, "0614-010190-100-0", "245871-4")).toMatch(
      /terceros_empresa_id_nrc_key/,
    );
    expect(await insertar(otra.empresaId, "1234-567890-123-0", "245871-4")).toBeNull();
  });

  it("varios terceros sin NRC conviven (el NRC es opcional)", async () => {
    expect(await insertar(esc.empresaId, "12345678-4")).toBeNull();
    expect(await insertar(esc.empresaId, "00000001-8")).toBeNull();
  });

  it("rechaza formatos inválidos de NIT y NRC", async () => {
    expect(await insertar(esc.empresaId, "123")).toMatch(/terceros_nit_formato/);
    expect(await insertar(esc.empresaId, "0000-000000-011-5", "ABC")).toMatch(/terceros_nrc_formato/);
  });

  it("exige ser cliente, proveedor o ambos y un plazo de crédito razonable", async () => {
    expect(await insertar(esc.empresaId, "1000-000000-009-0", null, { cliente: false })).toMatch(
      /terceros_es_cliente_o_proveedor/,
    );
    expect(await insertar(esc.empresaId, "0000-000000-104-0", null, { proveedor: true })).toBeNull();
    expect(await insertar(esc.empresaId, "0000-000000-011-5", null, { dias: 400 })).toMatch(
      /terceros_dias_credito_rango/,
    );
  });

  it("la clasificación usa el tipo de contribuyente y por defecto es otro", async () => {
    const r = await c.query(`select clasificacion from terceros where nit = '0000-000000-104-0'`);
    expect(r.rows[0].clasificacion).toBe("otro");
    expect(
      await errorDe(
        c,
        `insert into terceros (empresa_id, nombre, nit, clasificacion) values ($1, 'X', '1000-000000-009-0', 'enorme')`,
        [esc.empresaId],
      ),
    ).toMatch(/clasificacion_contribuyente/);
  });
});
