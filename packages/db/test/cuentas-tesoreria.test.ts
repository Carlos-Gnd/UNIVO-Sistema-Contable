// Cajas y cuentas bancarias (migración 20261123000200_cuentas_tesoreria, HU-76, S3-T112).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;
const cuentas: Record<string, string> = {};
let n = 0;

async function cuenta(empresa: Escenario, codigo: string, nombre: string) {
  const r = await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'deudora', 'activo') returning id`,
    [empresa.empresaId, codigo, nombre],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-010190-102-0");
  cuentas["110102"] = await cuenta(esc, "110102", "Caja chica");
  cuentas["110103"] = await cuenta(esc, "110103", "Bancos");
  cuentas["11010301"] = await cuenta(esc, "11010301", "Cuenta corriente");
  cuentas["11010302"] = await cuenta(esc, "11010302", "Cuenta de ahorro");
  cuentas["otra"] = otra.cuentas["110101"]!;
});
afterAll(async () => {
  await c?.end();
});

const insertar = (
  tipo: "caja" | "banco",
  cuentaId: string,
  extra: { empresa?: string; sucursal?: string | null; banco?: string | null; numero?: string | null } = {},
) =>
  errorDe(
    c,
    `insert into cuentas_tesoreria (empresa_id, sucursal_id, cuenta_id, tipo, nombre, banco, numero_cuenta)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      extra.empresa ?? esc.empresaId,
      extra.sucursal ?? null,
      cuentaId,
      tipo,
      `Cuenta ${++n}`,
      "banco" in extra ? extra.banco : tipo === "banco" ? "Banco Agrícola" : null,
      "numero" in extra ? extra.numero : tipo === "banco" ? `001-${n}` : null,
    ],
  );

describe("cuentas de tesorería", () => {
  it("vincula una caja y un banco a subcuentas de efectivo de último nivel", async () => {
    expect(await insertar("caja", esc.cuentas["110101"]!)).toBeNull();
    expect(await insertar("banco", cuentas["11010301"]!)).toBeNull();
  });

  it("una cuenta contable solo sirve para una caja o banco", async () => {
    expect(await insertar("caja", cuentas["110102"]!)).toBeNull();
    expect(await insertar("caja", cuentas["110102"]!)).toMatch(/cuentas_tesoreria_cuenta_id_key/);
  });

  it("la cuenta debe ser de efectivo (1101…), de último nivel y de la misma empresa", async () => {
    expect(await insertar("caja", esc.cuentas["5101"]!)).toMatch(/subcuenta de efectivo/);
    expect(await insertar("caja", esc.cuentas["1101"]!)).toMatch(/tiene subcuentas|subcuenta de efectivo/);
    expect(await insertar("caja", cuentas["110103"]!)).toMatch(/tiene subcuentas/);
    expect(await insertar("caja", cuentas["otra"]!)).toMatch(/no pertenece a la empresa/);
  });

  it("un banco necesita entidad y número; una caja no los lleva", async () => {
    expect(await insertar("banco", cuentas["11010302"]!, { banco: null })).toMatch(
      /cuentas_tesoreria_banco_datos/,
    );
    expect(await insertar("banco", cuentas["11010302"]!, { numero: null })).toMatch(
      /cuentas_tesoreria_banco_datos/,
    );
    const caja = await cuenta(esc, "110104", "Caja de ventas");
    expect(await insertar("caja", caja, { banco: "Banco X", numero: "1" })).toMatch(
      /cuentas_tesoreria_banco_datos/,
    );
  });

  it("el número de cuenta es único por empresa y banco", async () => {
    expect(await insertar("banco", cuentas["11010302"]!, { numero: "777" })).toBeNull();
    const otraCuenta = await cuenta(esc, "11010303", "Otra cuenta");
    expect(await insertar("banco", otraCuenta, { numero: "777" })).toMatch(
      /cuentas_tesoreria_empresa_id_banco/,
    );
  });

  it("la sucursal debe ser de la empresa", async () => {
    const cuentaNueva = await cuenta(esc, "110105", "Caja de sucursal");
    expect(await insertar("caja", cuentaNueva, { sucursal: otra.sucursalId })).toMatch(
      /sucursal no pertenece/,
    );
    expect(await insertar("caja", cuentaNueva, { sucursal: esc.sucursalId })).toBeNull();
  });

  it("no se cambia el tipo ni la cuenta contable, pero sí el nombre y el estado", async () => {
    const caja = (
      await c.query(`select id from cuentas_tesoreria where cuenta_id = $1`, [esc.cuentas["110101"]])
    ).rows[0].id as string;
    expect(
      await errorDe(c, `update cuentas_tesoreria set cuenta_id = $2 where id = $1`, [
        caja,
        cuentas["11010302"],
      ]),
    ).toMatch(/No se puede cambiar el tipo/);
    expect(
      await errorDe(
        c,
        `update cuentas_tesoreria set nombre = 'Caja principal', activa = false where id = $1`,
        [caja],
      ),
    ).toBeNull();
  });

  it("registra la bitácora y actualiza actualizado_en", async () => {
    const acciones = (
      await c.query(
        `select distinct accion from bitacora where empresa_id = $1 and tabla = 'cuentas_tesoreria'`,
        [esc.empresaId],
      )
    ).rows.map((f) => f.accion);
    expect(acciones).toEqual(expect.arrayContaining(["INSERT", "UPDATE"]));
  });
});
