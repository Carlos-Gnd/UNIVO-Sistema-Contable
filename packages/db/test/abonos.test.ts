// Abonos (migración 20261129000400_abonos, HU-62, S3-T70 y S3-T72): no se abona más que el saldo, el reparto suma el
// monto del abono, el cliente o proveedor coincide y todo queda inmutable.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crearEscenario, crearPartida, errorDe, reiniciarBase, type Escenario } from "./helpers";

let c: pg.Client;
let esc: Escenario;
let cliente: string;
let otroCliente: string;
let n = 0;

beforeAll(async () => {
  c = await reiniciarBase();
  esc = await crearEscenario(c, "0614-010190-101-5");
  const t = (nit: string) =>
    c
      .query(
        `insert into terceros (empresa_id, nombre, nit, es_cliente) values ($1, 'Cliente', $2, true) returning id`,
        [esc.empresaId, nit],
      )
      .then((r) => r.rows[0].id as string);
  cliente = await t("0000-000000-104-0");
  otroCliente = await t("0000-000000-105-5");
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

/** Venta a un cliente por 113.00 (CCF, IVA 13 %), al crédito o al contado. */
async function venta(condicion: "credito" | "contado" = "credito", tercero = cliente) {
  const nuevoId = randomUUID();
  return (
    await c.query(
      `insert into documentos_comerciales (empresa_id, sucursal_id, operacion, tipo_documento, numero_documento, fecha,
         tercero_id, condicion_pago, cuenta_pago_id, fecha_vencimiento, total_gravado, iva, total, total_neto, partida_id, id)
       values ($1, $2, 'venta', 'ccf', $3, '2026-10-04', $4, $5, $6, $7, 100, 13, 113, 113, $8, $9) returning id`,
      [
        esc.empresaId,
        esc.sucursalId,
        `V-${++n}`,
        tercero,
        condicion,
        condicion === "contado" ? esc.cuentas["110101"] : null,
        condicion === "credito" ? "2026-11-03" : null,
        await partida(nuevoId),
        nuevoId,
      ],
    )
  ).rows[0].id as string;
}

interface Datos {
  tercero?: string;
  caja?: string;
  fecha?: string;
  monto?: string;
  aplicaciones: { documento: string; monto: string }[];
}

/** Registra un abono con sus aplicaciones en una transacción (el reparto se revisa al confirmar). */
async function abono(d: Datos): Promise<string | null> {
  const monto = d.monto ?? d.aplicaciones.reduce((s, a) => s + Number(a.monto), 0).toFixed(2);
  await c.query("begin");
  try {
    const r = await c.query(
      `insert into abonos (empresa_id, sucursal_id, operacion, tercero_id, fecha, cuenta_pago_id, monto, partida_id)
       values ($1, $2, 'venta', $3, $4, $5, $6, $7) returning id`,
      [
        esc.empresaId,
        esc.sucursalId,
        d.tercero ?? cliente,
        d.fecha ?? "2026-10-10",
        d.caja ?? esc.cuentas["110101"],
        monto,
        await partida(randomUUID()),
      ],
    );
    for (const a of d.aplicaciones) {
      await c.query(
        `insert into abonos_documentos (empresa_id, abono_id, documento_id, monto) values ($1, $2, $3, $4)`,
        [esc.empresaId, r.rows[0].id, a.documento, a.monto],
      );
    }
    await c.query("commit");
    return null;
  } catch (e) {
    await c.query("rollback");
    return (e as Error).message;
  }
}

const saldo = async (doc: string, borradores = true) =>
  (await c.query(`select interno.saldo_documento($1, $2)::text s`, [doc, borradores])).rows[0].s as string;

describe("saldo del documento", () => {
  it("baja con cada abono, parcial o total", async () => {
    const doc = await venta();
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "40.00" }] })).toBeNull();
    expect(await saldo(doc)).toBe("73.00");
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "73.00" }] })).toBeNull();
    expect(await saldo(doc)).toBe("0.00");
  });

  it("los abonos en borrador solo cuentan si se piden; los anulados nunca", async () => {
    const doc = await venta();
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "13.00" }] })).toBeNull();
    expect(await saldo(doc, true)).toBe("100.00");
    expect(await saldo(doc, false)).toBe("113.00");
    const p = (
      await c.query(
        `select a.partida_id from abonos a join abonos_documentos x on x.abono_id = a.id where x.documento_id = $1`,
        [doc],
      )
    ).rows[0].partida_id as string;
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [p]);
    expect(await saldo(doc, false)).toBe("100.00");
  });
});

describe("reglas del abono", () => {
  it("no abona más que el saldo pendiente, sumando los abonos anteriores", async () => {
    const doc = await venta();
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "100.00" }] })).toBeNull();
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "13.01" }] })).toMatch(
      /supera el saldo pendiente/,
    );
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "13.00" }] })).toBeNull();
  });

  it("lo aplicado suma el monto del abono y hay al menos una aplicación", async () => {
    const doc = await venta();
    expect(await abono({ monto: "50.00", aplicaciones: [{ documento: doc, monto: "40.00" }] })).toMatch(
      /debe sumar el monto del abono/,
    );
    expect(await abono({ monto: "50.00", aplicaciones: [] })).toMatch(/debe sumar el monto del abono/);
  });

  it("solo aplica a documentos al crédito del mismo cliente, no anteriores al abono", async () => {
    const doc = await venta();
    expect(await abono({ tercero: otroCliente, aplicaciones: [{ documento: doc, monto: "10" }] })).toMatch(
      /mismo cliente o proveedor/,
    );
    expect(await abono({ aplicaciones: [{ documento: await venta("contado"), monto: "10" }] })).toMatch(
      /al crédito/,
    );
    expect(await abono({ fecha: "2026-10-03", aplicaciones: [{ documento: doc, monto: "10" }] })).toMatch(
      /anterior al documento/,
    );
  });

  it("el cobro entra a una cuenta de efectivo", async () => {
    const doc = await venta();
    expect(
      await abono({ caja: esc.cuentas["5101"]!, aplicaciones: [{ documento: doc, monto: "10" }] }),
    ).toMatch(/cuenta de efectivo/);
  });
});

describe("inmutabilidad", () => {
  it("solo se editan las observaciones; ni el abono ni su reparto se borran", async () => {
    const doc = await venta();
    expect(await abono({ aplicaciones: [{ documento: doc, monto: "10" }] })).toBeNull();
    const id = (await c.query(`select abono_id from abonos_documentos where documento_id = $1`, [doc]))
      .rows[0].abono_id as string;
    expect(await errorDe(c, `update abonos set observaciones = 'Recibo 12' where id = $1`, [id])).toBeNull();
    expect(await errorDe(c, `update abonos set monto = 5 where id = $1`, [id])).toMatch(
      /solo admite cambiar/,
    );
    expect(await errorDe(c, `delete from abonos where id = $1`, [id])).toMatch(/no se borran/);
    expect(await errorDe(c, `update abonos_documentos set monto = 1 where abono_id = $1`, [id])).toMatch(
      /no se modifican/,
    );
    expect(await errorDe(c, `delete from abonos_documentos where abono_id = $1`, [id])).toMatch(
      /no se borran/,
    );
  });
});
