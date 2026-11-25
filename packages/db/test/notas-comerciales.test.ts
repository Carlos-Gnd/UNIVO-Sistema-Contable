// Notas de crédito y de débito (migración 20261129000300_notas_comerciales, HU-61, S3-T67 y S3-T69):
// no se devuelve más de lo vendido, no se rebaja más que el saldo, el contado exige caja o banco y todo queda inmutable.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, crearPartida, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let cliente: string;
let producto: string;
let n = 0;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  cliente = (
    await c.query(
      `insert into terceros (empresa_id, nombre, nit, es_cliente) values ($1, 'Cliente', '0000-000000-104-0', true) returning id`,
      [esc.empresaId],
    )
  ).rows[0].id as string;
  producto = (
    await c.query(
      `insert into productos (empresa_id, codigo, nombre) values ($1, 'P-1', 'Producto') returning id`,
      [esc.empresaId],
    )
  ).rows[0].id as string;
});
afterAll(async () => {
  await c?.end();
});

/** Partida en borrador de una venta, con el id del documento como origen (lo exige el trigger). */
const partida = (documentoId: string) =>
  crearPartida(
    c,
    esc,
    "2026-10-04",
    [
      [esc.cuentas["110101"]!, "100", "0"],
      [esc.cuentas["5101"]!, "0", "100"],
    ],
    "operacion",
    { origen: "ventas", origenId: documentoId },
  );

/** Venta de 10 unidades a 10.00 (CCF, IVA 13 %), al crédito o al contado, con una sola línea de producto. */
async function venta(condicion: "credito" | "contado") {
  const nuevoId = randomUUID();
  const id = (
    await c.query(
      `insert into documentos_comerciales (empresa_id, sucursal_id, operacion, tipo_documento, numero_documento, fecha,
         tercero_id, condicion_pago, cuenta_pago_id, fecha_vencimiento, total_gravado, iva, total, total_neto, partida_id, id)
       values ($1, $2, 'venta', 'ccf', $3, '2026-10-04', $4, $5, $6, $7, 100, 13, 113, 113, $8, $9) returning id`,
      [
        esc.empresaId,
        esc.sucursalId,
        `V-${++n}`,
        cliente,
        condicion,
        condicion === "contado" ? esc.cuentas["110101"] : null,
        condicion === "credito" ? "2026-11-03" : null,
        await partida(nuevoId),
        nuevoId,
      ],
    )
  ).rows[0].id as string;
  const linea = (
    await c.query(
      `insert into documentos_comerciales_lineas (empresa_id, documento_id, orden, producto_id, descripcion, cantidad, precio_unitario, monto)
       values ($1, $2, 1, $3, 'Producto', 10, 10, 100) returning id`,
      [esc.empresaId, id, producto],
    )
  ).rows[0].id as string;
  return { id, linea };
}

interface DatosNota {
  tipo?: "credito" | "debito";
  motivo?: "devolucion" | "rebaja" | "cargo";
  caja?: string | null;
  gravado?: string;
  iva?: string;
  total?: string;
  fecha?: string;
  lineas?: {
    linea: string | null;
    cantidad: string;
    monto: string;
    producto?: string | null;
    cuenta?: string | null;
  }[];
}

/** Registra una nota con sus líneas en una transacción (la nota debe tener líneas al confirmar). */
async function nota(doc: { id: string; linea: string }, d: DatosNota = {}): Promise<string | null> {
  const tipo = d.tipo ?? "credito";
  const motivo = d.motivo ?? (tipo === "debito" ? "cargo" : "devolucion");
  const gravado = d.gravado ?? "10.00";
  const iva = d.iva ?? "1.30";
  const total = d.total ?? "11.30";
  const lineas =
    d.lineas ??
    (tipo === "debito"
      ? [{ linea: null, cantidad: "0", monto: gravado, cuenta: esc.cuentas["5101"]! }]
      : [{ linea: doc.linea, cantidad: motivo === "devolucion" ? "1" : "0", monto: gravado, producto }]);
  await c.query("begin");
  try {
    const r = await c.query(
      `insert into notas_comerciales (empresa_id, sucursal_id, documento_id, operacion, tipo, motivo, numero_nota, fecha,
         tercero_id, cuenta_pago_id, total_gravado, iva, total, total_neto, partida_id)
       values ($1, $2, $3, 'venta', $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13) returning id`,
      [
        esc.empresaId,
        esc.sucursalId,
        doc.id,
        tipo,
        motivo,
        `NC-${++n}`,
        d.fecha ?? "2026-10-10",
        cliente,
        d.caja === undefined ? null : d.caja,
        gravado,
        iva,
        total,
        await partida(randomUUID()),
      ],
    );
    let orden = 1;
    for (const l of lineas) {
      await c.query(
        `insert into notas_comerciales_lineas (empresa_id, nota_id, orden, linea_documento_id, producto_id, cuenta_id, descripcion, cantidad, monto)
         values ($1, $2, $3, $4, $5, $6, 'Línea', $7, $8)`,
        [
          esc.empresaId,
          r.rows[0].id,
          orden++,
          l.linea,
          l.producto ?? null,
          l.cuenta ?? null,
          l.cantidad,
          l.monto,
        ],
      );
    }
    await c.query("commit");
    return null;
  } catch (e) {
    await c.query("rollback");
    return (e as Error).message;
  }
}

describe("notas de crédito", () => {
  it("acepta una devolución parcial y una rebaja sobre un documento al crédito", async () => {
    const doc = await venta("credito");
    expect(await nota(doc)).toBeNull();
    expect(await nota(doc, { motivo: "rebaja", gravado: "5.00", iva: "0.65", total: "5.65" })).toBeNull();
    const saldo = await c.query(`select interno.saldo_documento($1, true)::text s`, [doc.id]);
    expect(saldo.rows[0].s).toBe("96.05");
  });

  it("no devuelve más unidades que las del documento, sumando las devoluciones anteriores", async () => {
    const doc = await venta("contado");
    const caja = esc.cuentas["110101"]!;
    const todas = { gravado: "90.00", iva: "11.70", total: "101.70" };
    expect(
      await nota(doc, {
        ...todas,
        caja,
        lineas: [{ linea: doc.linea, cantidad: "9", monto: "90.00", producto }],
      }),
    ).toBeNull();
    expect(
      await nota(doc, {
        caja,
        gravado: "20.00",
        iva: "2.60",
        total: "22.60",
        lineas: [{ linea: doc.linea, cantidad: "2", monto: "20.00", producto }],
      }),
    ).toMatch(/más unidades de las del documento/);
    expect(await nota(doc, { caja, gravado: "10.00", iva: "1.30", total: "11.30" })).toBeNull();
  });

  it("no rebaja más que el importe de la línea", async () => {
    const doc = await venta("contado");
    expect(
      await nota(doc, {
        motivo: "rebaja",
        caja: esc.cuentas["110101"]!,
        gravado: "100.01",
        iva: "13.00",
        total: "113.01",
        lineas: [{ linea: doc.linea, cantidad: "0", monto: "100.01", producto }],
      }),
    ).toMatch(/supera el importe de la línea/);
  });

  it("una devolución lleva el producto de la línea y sus unidades", async () => {
    const doc = await venta("credito");
    expect(
      await nota(doc, { lineas: [{ linea: doc.linea, cantidad: "0", monto: "10.00", producto }] }),
    ).toMatch(/lleva las unidades de un producto/);
    expect(await nota(doc, { lineas: [{ linea: null, cantidad: "1", monto: "10.00", producto }] })).toMatch(
      /corrige una línea del documento/,
    );
  });

  it("no supera el saldo del documento al crédito", async () => {
    const doc = await venta("credito");
    expect(
      await nota(doc, {
        motivo: "rebaja",
        gravado: "100.00",
        iva: "13.00",
        total: "113.00",
        lineas: [{ linea: doc.linea, cantidad: "0", monto: "100.00", producto }],
      }),
    ).toBeNull();
    await c.query(`select 1`);
    // Con el saldo en cero ya no cabe una nota más aunque la línea tuviera importe
    expect(
      await nota(doc, { motivo: "rebaja", lineas: [{ linea: doc.linea, cantidad: "0", monto: "1.00" }] }),
    ).toMatch(/supera el saldo pendiente|supera el importe/);
  });

  it("una nota sobre un documento al contado necesita su caja o banco; al crédito no la lleva", async () => {
    const contado = await venta("contado");
    expect(await nota(contado)).toMatch(/necesita la caja o el banco/);
    expect(await nota(contado, { caja: esc.cuentas["5101"]! })).toMatch(/cuenta de efectivo/);
    expect(await nota(contado, { caja: esc.cuentas["110101"]! })).toBeNull();
    const credito = await venta("credito");
    expect(await nota(credito, { caja: esc.cuentas["110101"]! })).toMatch(/sin caja ni banco/);
    // un documento al contado no deja saldo
    const saldo = await c.query(`select interno.saldo_documento($1, true)::text s`, [contado.id]);
    expect(saldo.rows[0].s).toBe("0");
  });

  it("no es anterior al documento y no queda sin líneas", async () => {
    const doc = await venta("credito");
    expect(await nota(doc, { fecha: "2026-10-03" })).toMatch(/anterior al documento/);
    expect(await nota(doc, { lineas: [] })).toMatch(/al menos una línea/);
  });
});

describe("notas de débito", () => {
  it("suben el saldo y se asientan en una cuenta, no en una línea del documento", async () => {
    const doc = await venta("credito");
    expect(await nota(doc, { tipo: "debito" })).toBeNull();
    const saldo = await c.query(`select interno.saldo_documento($1, true)::text s`, [doc.id]);
    expect(saldo.rows[0].s).toBe("124.30");
    expect(
      await nota(doc, {
        tipo: "debito",
        lineas: [{ linea: doc.linea, cantidad: "0", monto: "10", cuenta: esc.cuentas["5101"]! }],
      }),
    ).toMatch(/cuenta contable, no en una línea/);
  });
});

describe("saldo por estado de la partida", () => {
  it("las notas en borrador solo cuentan si se piden; las anuladas nunca", async () => {
    const doc = await venta("credito");
    expect(await nota(doc)).toBeNull();
    const consulta = (borradores: boolean) =>
      c
        .query(`select interno.saldo_documento($1, $2)::text s`, [doc.id, borradores])
        .then((r) => r.rows[0].s);
    expect(await consulta(true)).toBe("101.70");
    expect(await consulta(false)).toBe("113.00");
    const partidaNota = (
      await c.query(`select partida_id from notas_comerciales where documento_id = $1`, [doc.id])
    ).rows[0].partida_id as string;
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [partidaNota]);
    expect(await consulta(false)).toBe("101.70");
  });
});

describe("inmutabilidad", () => {
  it("solo se editan las observaciones; ni la nota ni sus líneas se borran", async () => {
    const doc = await venta("credito");
    expect(await nota(doc)).toBeNull();
    const id = (await c.query(`select id from notas_comerciales where documento_id = $1`, [doc.id])).rows[0]
      .id as string;
    expect(
      await errorDe(c, `update notas_comerciales set observaciones = 'Cliente devolvió' where id = $1`, [id]),
    ).toBeNull();
    expect(
      await errorDe(c, `update notas_comerciales set total = 1, total_neto = 1 where id = $1`, [id]),
    ).toMatch(/solo admite cambiar sus observaciones/);
    expect(await errorDe(c, `delete from notas_comerciales where id = $1`, [id])).toMatch(/no se borran/);
    expect(
      await errorDe(c, `update notas_comerciales_lineas set monto = 1 where nota_id = $1`, [id]),
    ).toMatch(/no se modifican/);
    expect(await errorDe(c, `delete from notas_comerciales_lineas where nota_id = $1`, [id])).toMatch(
      /no se borran/,
    );
  });

  it("el número de la nota no se repite en las ventas de la empresa", async () => {
    const doc = await venta("credito");
    expect(await nota(doc)).toBeNull();
    const fila = (await c.query(`select * from notas_comerciales where documento_id = $1`, [doc.id])).rows[0];
    expect(
      await errorDe(
        c,
        `insert into notas_comerciales (empresa_id, sucursal_id, documento_id, operacion, tipo, motivo, numero_nota, fecha,
           tercero_id, total_gravado, iva, total, total_neto, partida_id)
         values ($1, $2, $3, 'venta', 'credito', 'rebaja', $4, '2026-10-12', $5, 1, 0, 1, 1, $6)`,
        [esc.empresaId, esc.sucursalId, doc.id, fila.numero_nota, cliente, await partida(randomUUID())],
      ),
    ).toMatch(/notas_comerciales_venta_unica/);
  });
});
