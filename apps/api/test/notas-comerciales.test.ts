// Devoluciones y rebajas (HU-61, S3-T67 y S3-T69): la nota revierte IVA, kardex y saldo, y genera sus partidas.
// Usa una base propia (contable_api_notas) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DisponibleNota,
  DocumentoComercialVista,
  KardexVista,
  NotaComercialVista,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let clienteId: string;
let grandeId: string;
let proveedorId: string;
let productoId: string;
let cajaId: string;
let serie = 0;
let dia = 1;
/** Fecha que avanza un día en cada uso: el kardex no admite movimientos anteriores al último. */
const fecha = () => `2026-10-${String(++dia).padStart(2, "0")}`;

async function pedir(metodo: string, ruta: string, usuario: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const crear = async (ruta: string, cuerpo: Record<string, unknown>) => {
  const r = await pedir("POST", ruta, CONTADOR, cuerpo);
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo as unknown as DocumentoComercialVista;
};

const venta = (extra: Record<string, unknown> = {}) =>
  crear("/ventas", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: `CCF-${++serie}`,
    fecha: fecha(),
    terceroId: clienteId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 4, precioUnitario: 250 }],
    ...extra,
  });

const compra = (extra: Record<string, unknown> = {}) =>
  crear("/compras", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: `P-${++serie}`,
    fecha: fecha(),
    terceroId: proveedorId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 10, precioUnitario: 100 }],
    ...extra,
  });

const nota = (documentoId: string, extra: Record<string, unknown> = {}) =>
  pedir("POST", "/notas-comerciales", CONTADOR, {
    documentoId,
    tipo: "credito",
    motivo: "devolucion",
    numeroNota: `NC-${++serie}`,
    fecha: fecha(),
    lineas: [{ lineaOrden: 1, cantidad: 1 }],
    ...extra,
  });

const lineas = async (partidaId: string | null) =>
  partidaId === null
    ? null
    : (
        await c.query(
          `select cu.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
           where d.partida_id = $1 order by d.orden`,
          [partidaId],
        )
      ).rows.map((f) => [f.codigo, f.debe, f.haber]);

const disponible = async (op: "compra" | "venta", id: string) =>
  (await pedir("GET", `/notas-comerciales/disponible/${op}/${id}`, CONTADOR))
    .cuerpo as unknown as DisponibleNota;

const kardex = async () =>
  (await pedir("GET", `/productos/${productoId}/kardex?sucursalId=${emp.sucursalId}`, CONTADOR))
    .cuerpo as unknown as KardexVista;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_notas");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.sucursalId]);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.sucursalId]);
  cajaId = await emp.cuenta("110101");

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  const tercero = async (cuerpo: Record<string, unknown>) =>
    (await pedir("POST", "/terceros", CONTADOR, cuerpo)).cuerpo["id"] as string;
  clienteId = await tercero({
    nombre: "Tecno Plaza",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    esCliente: true,
  });
  grandeId = await tercero({
    nombre: "Cliente grande",
    nit: "1000-000000-009-0",
    nrc: "333333-3",
    esCliente: true,
    clasificacion: "grande",
  });
  proveedorId = await tercero({
    nombre: "Totalynk",
    nit: "0000-000000-104-0",
    nrc: "123456-7",
    esProveedor: true,
  });
  productoId = (await pedir("POST", "/productos", CONTADOR, { codigo: "CP-01", nombre: "Galaxy S24" }))
    .cuerpo["id"] as string;
  await compra({ numeroDocumento: "CCF-P000", lineas: [{ productoId, cantidad: 20, precioUnitario: 100 }] });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("devolución sobre una venta al crédito", () => {
  let doc: DocumentoComercialVista;
  let devolucion: NotaComercialVista;

  it("revierte ventas, IVA y cuentas por cobrar, y regresa el costo a inventarios", async () => {
    doc = await venta();
    expect(doc.totalNeto).toBe("1130.00");
    const antes = await kardex();
    const r = await nota(doc.id);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    devolucion = r.cuerpo as unknown as NotaComercialVista;
    expect(devolucion).toMatchObject({
      tipo: "credito",
      motivo: "devolucion",
      totalGravado: "250.00",
      iva: "32.50",
      total: "282.50",
      totalNeto: "282.50",
      estadoPartida: "borrador",
    });
    expect(devolucion.lineas[0]).toMatchObject({
      cantidad: "1.0000",
      monto: "250.00",
      costoKardex: "100.00",
    });
    expect(await lineas(devolucion.partidaId)).toEqual([
      ["1103", "0.00", "282.50"],
      ["5101", "250.00", "0.00"],
      ["2109", "32.50", "0.00"],
    ]);
    expect(await lineas(devolucion.partidaCostoId)).toEqual([
      ["4104", "0.00", "100.00"],
      ["1109", "100.00", "0.00"],
    ]);
    const despues = await kardex();
    expect(despues.totales.entradaCantidad).toBe((Number(antes.totales.entradaCantidad) + 1).toFixed(4));
  });

  it("las partidas enlazan la nota, nacen en borrador y se contabilizan porque cuadran", async () => {
    const filas = (
      await c.query(
        `select origen, estado, origen_id, documento_tipo, documento_numero from partidas where id = any($1::uuid[]) order by origen`,
        [[devolucion.partidaId, devolucion.partidaCostoId]],
      )
    ).rows;
    expect(filas).toEqual([
      {
        origen: "notas",
        estado: "borrador",
        origen_id: devolucion.id,
        documento_tipo: "NC",
        documento_numero: devolucion.numeroNota,
      },
      {
        origen: "notas_costo",
        estado: "borrador",
        origen_id: devolucion.id,
        documento_tipo: "NC",
        documento_numero: devolucion.numeroNota,
      },
    ]);
    await c.query(`update partidas set estado = 'contabilizada' where id = any($1::uuid[])`, [
      [devolucion.partidaId, devolucion.partidaCostoId],
    ]);
  });

  it("baja el saldo del documento y las unidades disponibles", async () => {
    const d = await disponible("venta", doc.id);
    expect(d.saldo).toBe("847.50");
    expect(d.lineas[0]).toMatchObject({ cantidadDisponible: "3.0000", montoDisponible: "750.00" });
  });

  it("no se devuelven más unidades que las vendidas, sumando las devoluciones anteriores", async () => {
    const r = await nota(doc.id, { lineas: [{ lineaOrden: 1, cantidad: 4 }] });
    expect(r.status).toBe(422);
    expect(String(r.cuerpo["message"])).toMatch(/quedan 3 por devolver/);
    expect((await nota(doc.id, { lineas: [{ lineaOrden: 1, cantidad: 3 }] })).status).toBe(201);
    expect((await disponible("venta", doc.id)).lineas[0]).toMatchObject({
      cantidadDisponible: "0.0000",
      montoDisponible: "0.00",
    });
    expect((await nota(doc.id)).status).toBe(422);
  });

  it("la lista y el detalle devuelven las notas del documento", async () => {
    const lista = await pedir("GET", `/notas-comerciales?operacion=venta&documentoId=${doc.id}`, CONSULTA);
    expect(lista.status).toBe(200);
    expect(lista.cuerpo).toHaveLength(2);
    const uno = await pedir("GET", `/notas-comerciales/${devolucion.id}`, CONSULTA);
    expect(uno.status).toBe(200);
    expect(uno.cuerpo["documento"]).toMatchObject({ id: doc.id, numeroDocumento: doc.numeroDocumento });
  });
});

describe("rebaja y cargo sobre una venta", () => {
  it("una rebaja baja ventas e IVA sin mover el kardex", async () => {
    const doc = await venta({ lineas: [{ productoId, cantidad: 2, precioUnitario: 250 }] });
    const antes = await kardex();
    const r = await nota(doc.id, { motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: 50 }] });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const n = r.cuerpo as unknown as NotaComercialVista;
    expect(n).toMatchObject({
      motivo: "rebaja",
      totalGravado: "50.00",
      iva: "6.50",
      total: "56.50",
      partidaCostoId: null,
    });
    expect(await lineas(n.partidaId)).toEqual([
      ["1103", "0.00", "56.50"],
      ["5101", "50.00", "0.00"],
      ["2109", "6.50", "0.00"],
    ]);
    expect(await kardex()).toEqual(antes);
    expect((await disponible("venta", doc.id)).saldo).toBe("508.50");
    // no se rebaja más que el importe de la línea
    const mucho = await nota(doc.id, { motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: 451 }] });
    expect(mucho.status).toBe(422);
  });

  it("un cargo adicional (nota de débito) sube el saldo y el débito fiscal", async () => {
    const doc = await venta({ lineas: [{ productoId, cantidad: 1, precioUnitario: 250 }] });
    const r = await nota(doc.id, {
      tipo: "debito",
      motivo: "cargo",
      numeroNota: "ND-1",
      lineas: [{ cuentaId: await emp.cuenta("5101"), monto: 20, descripcion: "Intereses por mora" }],
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const n = r.cuerpo as unknown as NotaComercialVista;
    expect(n).toMatchObject({ tipo: "debito", total: "22.60", iva: "2.60" });
    expect(await lineas(n.partidaId)).toEqual([
      ["1103", "22.60", "0.00"],
      ["5101", "0.00", "20.00"],
      ["2109", "0.00", "2.60"],
    ]);
    expect((await disponible("venta", doc.id)).saldo).toBe("305.10");
  });

  it("una nota de crédito no supera el saldo del documento", async () => {
    const doc = await venta({ lineas: [{ productoId, cantidad: 1, precioUnitario: 250 }] });
    // la base lo impide también: el saldo pendiente es 282.50
    const r = await nota(doc.id, { motivo: "rebaja", lineas: [{ lineaOrden: 1, monto: 250 }] });
    expect(r.status).toBe(201);
    expect((await disponible("venta", doc.id)).saldo).toBe("0.00");
  });
});

describe("retención del 1 % de un cliente gran contribuyente", () => {
  it("la devolución parcial revierte la parte proporcional de lo retenido", async () => {
    const doc = await venta({
      terceroId: grandeId,
      lineas: [{ productoId, cantidad: 4, precioUnitario: 250 }],
    });
    expect(doc).toMatchObject({ ivaRetenido: "10.00", totalNeto: "1120.00" });
    const r = await nota(doc.id, { lineas: [{ lineaOrden: 1, cantidad: 2 }] });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const n = r.cuerpo as unknown as NotaComercialVista;
    expect(n).toMatchObject({ iva: "65.00", ivaRetenido: "5.00", total: "565.00", totalNeto: "560.00" });
    expect((await disponible("venta", doc.id)).saldo).toBe("560.00");
    const filasPartida = await lineas(n.partidaId);
    expect(filasPartida).toEqual([
      ["1103", "0.00", "560.00"],
      ["111302", "0.00", "5.00"],
      ["5101", "500.00", "0.00"],
      ["2109", "65.00", "0.00"],
    ]);
  });
});

describe("venta al contado", () => {
  it("el reembolso sale de la caja elegida y es obligatoria", async () => {
    const doc = await venta({ condicionPago: "contado", cuentaPagoId: cajaId });
    const sin = await nota(doc.id);
    expect(sin.status).toBe(422);
    expect(String(sin.cuerpo["message"])).toMatch(/caja o el banco/);
    const r = await nota(doc.id, { cuentaPagoId: cajaId });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const n = r.cuerpo as unknown as NotaComercialVista;
    expect(await lineas(n.partidaId)).toEqual([
      ["110101", "0.00", "282.50"],
      ["5101", "250.00", "0.00"],
      ["2109", "32.50", "0.00"],
    ]);
    expect((await disponible("venta", doc.id)).saldo).toBe("0.00");
  });

  it("un documento al crédito rechaza la caja", async () => {
    const doc = await venta();
    const r = await nota(doc.id, { cuentaPagoId: cajaId });
    expect(r.status).toBe(422);
  });
});

describe("devolución al proveedor", () => {
  it("sale del kardex y revierte inventario, crédito fiscal y cuentas por pagar", async () => {
    const doc = await compra();
    const antes = await kardex();
    const r = await nota(doc.id, { lineas: [{ lineaOrden: 1, cantidad: 2 }] });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const n = r.cuerpo as unknown as NotaComercialVista;
    expect(n).toMatchObject({ operacion: "compra", total: "226.00", iva: "26.00", partidaCostoId: null });
    expect(await lineas(n.partidaId)).toEqual([
      ["1109", "0.00", "200.00"],
      ["1112", "0.00", "26.00"],
      ["210201", "226.00", "0.00"],
    ]);
    const despues = await kardex();
    expect(Number(despues.totales.salidaCantidad) - Number(antes.totales.salidaCantidad)).toBe(2);
    expect((await disponible("compra", doc.id)).saldo).toBe("904.00");
  });

  it("sin existencias en el kardex la devolución se rechaza", async () => {
    const doc = await compra({ lineas: [{ productoId, cantidad: 1, precioUnitario: 100 }] });
    // las existencias se agotan con ventas
    const k = await kardex();
    const sobrante = Number(k.totales.entradaCantidad) - Number(k.totales.salidaCantidad);
    await venta({
      condicionPago: "contado",
      cuentaPagoId: cajaId,
      lineas: [{ productoId, cantidad: sobrante, precioUnitario: 150 }],
    });
    const r = await nota(doc.id);
    expect(r.status).toBe(422);
    expect(String(r.cuerpo["message"])).toMatch(/Existencia insuficiente/);
  });
});

describe("permisos y datos", () => {
  beforeAll(async () => {
    await compra({ lineas: [{ productoId, cantidad: 10, precioUnitario: 100 }] });
  });

  it("el auxiliar registra, la consulta solo lee y el número no se repite", async () => {
    const doc = await venta();
    const cuerpo = {
      documentoId: doc.id,
      tipo: "credito",
      motivo: "rebaja",
      numeroNota: "NC-UNICA",
      fecha: fecha(),
      lineas: [{ lineaOrden: 1, monto: 10 }],
    };
    expect((await pedir("POST", "/notas-comerciales", CONSULTA, cuerpo)).status).toBe(403);
    expect((await pedir("POST", "/notas-comerciales", AUXILIAR, cuerpo)).status).toBe(201);
    expect((await pedir("POST", "/notas-comerciales", CONTADOR, cuerpo)).status).toBe(409);
    expect((await pedir("POST", "/notas-comerciales", null, cuerpo)).status).toBe(401);
  });

  it("la nota no es anterior al documento ni mezcla tipo y motivo", async () => {
    const doc = await venta();
    expect((await nota(doc.id, { fecha: "2026-10-01" })).status).toBe(422);
    expect((await nota(doc.id, { tipo: "debito" })).status).toBe(400);
    expect((await nota(doc.id, { lineas: [{ lineaOrden: 1 }] })).status).toBe(400);
  });
});
