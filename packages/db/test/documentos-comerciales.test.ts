// Documentos de compra y venta (migración 20261129000100_documentos_comerciales, HU-59, S3-T61 y S3-T63):
// totales que cuadran, pago al contado o al crédito, documento único, proveedor o cliente y líneas inmutables.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, crearPartida, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let otra: Escenario;
let proveedor: string;
let cliente: string;
let ajeno: string;
let n = 0;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  otra = await crearEscenario(c, "0614-010190-102-0");
  const t = (empresa: string, nit: string, cli: boolean, prov: boolean) =>
    c
      .query(
        `insert into terceros (empresa_id, nombre, nit, es_cliente, es_proveedor) values ($1, 'T', $2, $3, $4) returning id`,
        [empresa, nit, cli, prov],
      )
      .then((r) => r.rows[0].id as string);
  proveedor = await t(esc.empresaId, "1234-567890-123-0", false, true);
  cliente = await t(esc.empresaId, "0000-000000-104-0", true, false);
  ajeno = await t(otra.empresaId, "1234-567890-123-0", true, true);
});
afterAll(async () => {
  await c?.end();
});

/** Partida en borrador con dos líneas que cuadran, para colgar un documento de ella. */
const partida = async (e: Escenario = esc) =>
  crearPartida(c, e, "2026-10-04", [
    [e.cuentas["110101"]!, "100", "0"],
    [e.cuentas["5101"]!, "0", "100"],
  ]);

interface Datos {
  operacion: string;
  tipo: string;
  numero: string;
  tercero: string | null;
  condicion: string;
  caja: string | null;
  vence: string | null;
  gravado: string;
  iva: string;
  percibido: string;
  retenido: string;
  total: string;
  neto: string;
  empresa: Escenario;
  partida: string;
}

const base = (extra: Partial<Datos> = {}): Datos => ({
  operacion: "compra",
  tipo: "ccf",
  numero: `D-${++n}`,
  tercero: proveedor,
  condicion: "contado",
  caja: esc.cuentas["110101"]!,
  vence: null,
  gravado: "100.00",
  iva: "13.00",
  percibido: "0",
  retenido: "0",
  total: "113.00",
  neto: "113.00",
  empresa: esc,
  partida: "",
  ...extra,
});

const insertar = async (extra: Partial<Datos> = {}) => {
  const d = base(extra);
  d.partida ||= await partida(d.empresa);
  return errorDe(
    c,
    `insert into documentos_comerciales (empresa_id, sucursal_id, operacion, tipo_documento, numero_documento, fecha,
       tercero_id, condicion_pago, cuenta_pago_id, fecha_vencimiento, total_gravado, iva, iva_percibido, iva_retenido,
       total, total_neto, partida_id)
     values ($1, $2, $3, $4, $5, '2026-10-04', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      d.empresa.empresaId,
      d.empresa.sucursalId,
      d.operacion,
      d.tipo,
      d.numero,
      d.tercero,
      d.condicion,
      d.caja,
      d.vence,
      d.gravado,
      d.iva,
      d.percibido,
      d.retenido,
      d.total,
      d.neto,
      d.partida,
    ],
  );
};

describe("totales", () => {
  it("acepta un documento que cuadra, con IVA percibido o retenido", async () => {
    expect(await insertar()).toBeNull();
    expect(await insertar({ percibido: "1.00", total: "114.00", neto: "114.00" })).toBeNull();
    expect(await insertar({ retenido: "1.00", neto: "112.00" })).toBeNull();
  });

  it("rechaza un total que no es la suma de sus partes o un neto que no resta la retención", async () => {
    expect(await insertar({ total: "120.00", neto: "120.00" })).toMatch(
      /documentos_comerciales_total_cuadra/,
    );
    expect(await insertar({ retenido: "1.00", neto: "113.00" })).toMatch(
      /documentos_comerciales_total_cuadra/,
    );
    expect(await insertar({ total: "0", gravado: "0", iva: "0", neto: "0" })).toMatch(
      /documentos_comerciales_montos_no_negativos/,
    );
  });
});

describe("condición de pago", () => {
  it("el contado lleva su cuenta de efectivo y no vence", async () => {
    expect(await insertar({ caja: null })).toMatch(/documentos_comerciales_pago/);
    expect(await insertar({ vence: "2026-11-03" })).toMatch(/documentos_comerciales_pago/);
  });

  it("el crédito lleva fecha de vencimiento posterior y no cuenta de efectivo", async () => {
    expect(await insertar({ condicion: "credito", caja: null, vence: "2026-11-03" })).toBeNull();
    expect(await insertar({ condicion: "credito", caja: null, vence: null })).toMatch(
      /documentos_comerciales_pago/,
    );
    expect(await insertar({ condicion: "credito", caja: null, vence: "2026-10-01" })).toMatch(
      /documentos_comerciales_pago/,
    );
  });

  it("la cuenta de pago debe ser de efectivo (1101…)", async () => {
    expect(await insertar({ caja: esc.cuentas["5101"]! })).toMatch(/cuenta de efectivo/);
  });
});

describe("proveedor, cliente y empresa", () => {
  it("una compra necesita proveedor y una venta un cliente; un CCF siempre tercero", async () => {
    expect(await insertar({ tipo: "factura", tercero: null })).toMatch(
      /documentos_comerciales_compra_con_proveedor/,
    );
    expect(await insertar({ tercero: cliente })).toMatch(/debe ser un proveedor/);
    expect(await insertar({ operacion: "venta", tercero: proveedor })).toMatch(/debe ser un cliente/);
    expect(await insertar({ operacion: "venta", tercero: cliente })).toBeNull();
    expect(await insertar({ operacion: "venta", tipo: "factura", tercero: null })).toBeNull();
    expect(await insertar({ operacion: "venta", tipo: "ccf", tercero: null })).toMatch(
      /documentos_comerciales_ccf_con_tercero/,
    );
  });

  it("la exportación es solo de ventas", async () => {
    expect(await insertar({ tipo: "exportacion" })).toMatch(/documentos_comerciales_exportacion_solo_venta/);
    expect(
      await insertar({
        operacion: "venta",
        tipo: "exportacion",
        tercero: cliente,
        iva: "0",
        gravado: "113.00",
      }),
    ).toBeNull();
  });

  it("no mezcla empresas: el tercero y la partida deben ser de la misma empresa", async () => {
    expect(await insertar({ tercero: ajeno })).toMatch(/debe ser un proveedor/);
    expect(await insertar({ partida: await partida(otra) })).toMatch(/partida no pertenece/);
  });
});

describe("unicidad", () => {
  it("una compra no se repite del mismo proveedor, pero sí con otro proveedor o tipo", async () => {
    expect(await insertar({ numero: "U-1" })).toBeNull();
    expect(await insertar({ numero: "U-1" })).toMatch(/documentos_comerciales_compra_unica/);
    expect(await insertar({ numero: "U-1", tipo: "factura" })).toBeNull();
    const otro = (
      await c.query(
        `insert into terceros (empresa_id, nombre, nit, es_proveedor) values ($1, 'Otro', '1000-000000-009-0', true) returning id`,
        [esc.empresaId],
      )
    ).rows[0].id as string;
    expect(await insertar({ numero: "U-1", tercero: otro })).toBeNull();
  });

  it("una venta no repite su número en la empresa, aunque sea a otro cliente", async () => {
    expect(await insertar({ operacion: "venta", tercero: cliente, numero: "V-1" })).toBeNull();
    expect(await insertar({ operacion: "venta", tercero: null, tipo: "ccf", numero: "V-1" })).toMatch(
      /documentos_comerciales_ccf_con_tercero/,
    );
    expect(await insertar({ operacion: "venta", tercero: cliente, numero: "V-1" })).toMatch(
      /documentos_comerciales_venta_unica/,
    );
    // otra empresa sí puede usar el mismo número
    expect(
      await insertar({
        operacion: "venta",
        tercero: ajeno,
        numero: "V-1",
        empresa: otra,
        caja: otra.cuentas["110101"]!,
      }),
    ).toBeNull();
  });
});

describe("inmutabilidad", () => {
  it("solo se editan las observaciones; el documento y sus líneas no se borran", async () => {
    expect(await insertar({ numero: "I-1" })).toBeNull();
    const id = (await c.query(`select id from documentos_comerciales where numero_documento = 'I-1'`)).rows[0]
      .id as string;
    expect(
      await errorDe(c, `update documentos_comerciales set observaciones = 'Entregado' where id = $1`, [id]),
    ).toBeNull();
    expect(await errorDe(c, `update documentos_comerciales set total = 1 where id = $1`, [id])).toMatch(
      /solo admite cambiar sus observaciones/,
    );
    expect(await errorDe(c, `delete from documentos_comerciales where id = $1`, [id])).toMatch(
      /no se borran/,
    );

    await c.query(
      `insert into documentos_comerciales_lineas (empresa_id, documento_id, orden, cuenta_id, descripcion, cantidad, precio_unitario, monto)
       values ($1, $2, 1, $3, 'Servicio', 1, 100, 100)`,
      [esc.empresaId, id, esc.cuentas["5101"]],
    );
    expect(
      await errorDe(c, `update documentos_comerciales_lineas set monto = 5 where documento_id = $1`, [id]),
    ).toMatch(/no se modifican/);
    expect(
      await errorDe(c, `delete from documentos_comerciales_lineas where documento_id = $1`, [id]),
    ).toMatch(/no se borran/);
  });

  it("una línea necesita un producto o una cuenta, y de la misma empresa", async () => {
    const id = (await c.query(`select id from documentos_comerciales where numero_documento = 'I-1'`)).rows[0]
      .id as string;
    const linea = (orden: number, cuenta: string | null) =>
      errorDe(
        c,
        `insert into documentos_comerciales_lineas (empresa_id, documento_id, orden, cuenta_id, descripcion, cantidad, precio_unitario, monto)
         values ($1, $2, $3, $4, 'X', 1, 1, 1)`,
        [esc.empresaId, id, orden, cuenta],
      );
    expect(await linea(2, null)).toMatch(/documentos_comerciales_lineas_producto_o_cuenta/);
    expect(await linea(3, otra.cuentas["5101"]!)).toMatch(/La cuenta no pertenece/);
    expect(await linea(1, esc.cuentas["5101"]!)).toMatch(
      /documentos_comerciales_lineas_documento_id_orden_key/,
    );
  });
});
