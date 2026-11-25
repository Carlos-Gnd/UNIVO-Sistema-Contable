// Abonos de cuentas por cobrar y por pagar (HU-62, S3-T70 y S3-T72): el saldo baja exactamente con cada abono.
// Usa una base propia (contable_api_abonos) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AbonoVista, DocumentoComercialVista, DocumentoPendiente } from "@contable/shared";
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
let proveedorId: string;
let otroProveedorId: string;
let clienteId: string;
let cajaId: string;
let bancoId: string;
let serie = 0;

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

/** Compra al crédito de 1,000.00 más IVA (1,130.00) salvo que se indique otro valor. */
const compra = (precio = 1000, extra: Record<string, unknown> = {}) =>
  crear("/compras", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: `P-${++serie}`,
    fecha: "2026-10-04",
    terceroId: proveedorId,
    condicionPago: "credito",
    lineas: [{ cuentaId: cuentaGasto, cantidad: 1, precioUnitario: precio }],
    ...extra,
  });
let cuentaGasto: string;

const venta = (precio = 1000, extra: Record<string, unknown> = {}) =>
  crear("/ventas", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: `V-${++serie}`,
    fecha: "2026-10-04",
    terceroId: clienteId,
    condicionPago: "credito",
    lineas: [{ cuentaId: cuentaIngreso, cantidad: 1, precioUnitario: precio }],
    ...extra,
  });
let cuentaIngreso: string;

const abono = (
  operacion: "compra" | "venta",
  aplicaciones: { documentoId: string; monto: string }[],
  extra = {},
) =>
  pedir("POST", "/abonos", CONTADOR, {
    operacion,
    sucursalId: emp.sucursalId,
    terceroId: operacion === "compra" ? proveedorId : clienteId,
    fecha: "2026-10-10",
    cuentaPagoId: cajaId,
    aplicaciones,
    ...extra,
  });

const pendientes = async (operacion: "compra" | "venta") =>
  (await pedir("GET", `/abonos/pendientes?operacion=${operacion}`, CONTADOR))
    .cuerpo as unknown as DocumentoPendiente[];

const lineas = async (partidaId: string) =>
  (
    await c.query(
      `select cu.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
       where d.partida_id = $1 order by d.orden`,
      [partidaId],
    )
  ).rows.map((f) => [f.codigo, f.debe, f.haber]);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_abonos");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.sucursalId]);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.sucursalId]);
  cajaId = await emp.cuenta("110101");
  bancoId = await emp.cuenta("11010301");
  cuentaGasto = await emp.cuenta("4201");
  cuentaIngreso = await emp.cuenta("5101");

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
  proveedorId = await tercero({
    nombre: "Totalynk",
    nit: "0000-000000-104-0",
    nrc: "123456-7",
    esProveedor: true,
  });
  otroProveedorId = await tercero({
    nombre: "SP Importadora",
    nit: "1000-000000-009-0",
    nrc: "333333-3",
    esProveedor: true,
  });
  clienteId = await tercero({
    nombre: "Tecno Plaza",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    esCliente: true,
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("pago parcial a un proveedor", () => {
  let doc: DocumentoComercialVista;
  let primero: AbonoVista;

  it("baja el saldo del documento exactamente lo abonado y genera la partida contra caja", async () => {
    doc = await compra();
    expect(doc.totalNeto).toBe("1130.00");
    const r = await abono("compra", [{ documentoId: doc.id, monto: "500" }], { referencia: "CHQ-0002" });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    primero = r.cuerpo as unknown as AbonoVista;
    expect(primero).toMatchObject({
      operacion: "compra",
      monto: "500.00",
      estadoPartida: "borrador",
      referencia: "CHQ-0002",
    });
    expect(primero.aplicaciones).toEqual([
      { documentoId: doc.id, tipoDocumento: "ccf", numeroDocumento: doc.numeroDocumento, monto: "500.00" },
    ]);
    expect(await lineas(primero.partidaId)).toEqual([
      ["210201", "500.00", "0.00"],
      ["110101", "0.00", "500.00"],
    ]);
    const p = (await pendientes("compra")).find((x) => x.id === doc.id)!;
    expect(p).toMatchObject({ totalNeto: "1130.00", ajustes: "0.00", abonado: "500.00", saldo: "630.00" });
  });

  it("la partida enlaza el abono, nace en borrador y se contabiliza porque cuadra", async () => {
    const [f] = (
      await c.query(
        `select origen, estado, origen_id, documento_tipo, documento_numero from partidas where id = $1`,
        [primero.partidaId],
      )
    ).rows;
    expect(f).toEqual({
      origen: "abonos",
      estado: "borrador",
      origen_id: primero.id,
      documento_tipo: "PAGO",
      documento_numero: "CHQ-0002",
    });
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [primero.partidaId]);
  });

  it("no se abona más que el saldo pendiente, ni se repite el documento", async () => {
    const mas = await abono("compra", [{ documentoId: doc.id, monto: "630.01" }]);
    expect(mas.status).toBe(422);
    expect(String(mas.cuerpo["message"])).toMatch(/supera su saldo pendiente \(630\.00\)/);
    const repetido = await abono("compra", [
      { documentoId: doc.id, monto: "10" },
      { documentoId: doc.id, monto: "10" },
    ]);
    expect(repetido.status).toBe(400);
    expect((await abono("compra", [{ documentoId: doc.id, monto: "630" }])).status).toBe(201);
    expect((await pendientes("compra")).some((x) => x.id === doc.id)).toBe(false);
  });
});

describe("pago a varios documentos", () => {
  it("reparte un solo pago entre documentos del mismo proveedor, con una sola partida", async () => {
    const a = await compra(1000);
    const b = await compra(500);
    const r = await abono(
      "compra",
      [
        { documentoId: a.id, monto: "1130.00" },
        { documentoId: b.id, monto: "100.00" },
      ],
      { cuentaPagoId: bancoId },
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const v = r.cuerpo as unknown as AbonoVista;
    expect(v.monto).toBe("1230.00");
    expect(v.aplicaciones).toHaveLength(2);
    expect(await lineas(v.partidaId)).toEqual([
      ["210201", "1230.00", "0.00"],
      ["11010301", "0.00", "1230.00"],
    ]);
    const saldos = Object.fromEntries((await pendientes("compra")).map((x) => [x.id, x.saldo]));
    expect(saldos[b.id]).toBe("465.00");
    expect(saldos[a.id]).toBeUndefined();
  });

  it("rechaza documentos de otro proveedor, al contado o anteriores a la fecha del documento", async () => {
    const ajeno = await compra(100, { terceroId: otroProveedorId });
    const mio = await compra(100);
    const r1 = await abono("compra", [{ documentoId: ajeno.id, monto: "10" }]);
    expect(r1.status).toBe(422);
    expect(String(r1.cuerpo["message"])).toMatch(/no es de Totalynk/);
    const contado = await compra(100, { condicionPago: "contado", cuentaPagoId: cajaId });
    const r2 = await abono("compra", [{ documentoId: contado.id, monto: "10" }]);
    expect(r2.status).toBe(422);
    expect(String(r2.cuerpo["message"])).toMatch(/al contado/);
    const r3 = await abono("compra", [{ documentoId: mio.id, monto: "10" }], { fecha: "2026-10-01" });
    expect(r3.status).toBe(422);
    // un cobro no se aplica a una compra
    expect((await abono("venta", [{ documentoId: mio.id, monto: "10" }])).status).toBe(422);
  });
});

describe("cobro a un cliente", () => {
  it("entra a caja contra cuentas por cobrar y el saldo cuenta las notas y los abonos", async () => {
    const v1 = await venta(1000);
    const cobro = await abono("venta", [{ documentoId: v1.id, monto: "400" }]);
    expect(cobro.status, JSON.stringify(cobro.cuerpo)).toBe(201);
    expect(await lineas((cobro.cuerpo as unknown as AbonoVista).partidaId)).toEqual([
      ["110101", "400.00", "0.00"],
      ["1103", "0.00", "400.00"],
    ]);
    // una nota de crédito posterior solo puede bajar lo que todavía se debe (730.00)
    const nota = (monto: number) =>
      pedir("POST", "/notas-comerciales", CONTADOR, {
        documentoId: v1.id,
        tipo: "credito",
        motivo: "rebaja",
        numeroNota: `NC-${++serie}`,
        fecha: "2026-10-11",
        lineas: [{ lineaOrden: 1, monto }],
      });
    expect((await nota(500)).status).toBe(201);
    const p = (await pendientes("venta")).find((x) => x.id === v1.id)!;
    expect(p).toMatchObject({ ajustes: "565.00", abonado: "400.00", saldo: "165.00" });
    expect((await nota(200)).status).toBe(422);
    // y el cobro sigue limitado al saldo restante
    expect((await abono("venta", [{ documentoId: v1.id, monto: "165.01" }])).status).toBe(422);
    expect((await abono("venta", [{ documentoId: v1.id, monto: "165.00" }])).status).toBe(201);
    expect((await pendientes("venta")).some((x) => x.id === v1.id)).toBe(false);
  });

  it("la lista y el detalle devuelven los cobros", async () => {
    const lista = await pedir("GET", `/abonos?operacion=venta&terceroId=${clienteId}`, CONSULTA);
    expect(lista.status).toBe(200);
    expect((lista.cuerpo as unknown as AbonoVista[]).length).toBeGreaterThanOrEqual(2);
    const [primero] = lista.cuerpo as unknown as AbonoVista[];
    const uno = await pedir("GET", `/abonos/${primero!.id}`, CONSULTA);
    expect(uno.status).toBe(200);
    expect(uno.cuerpo["aplicaciones"]).toHaveLength(1);
  });
});

describe("permisos y datos", () => {
  it("el auxiliar registra, la consulta solo lee y sin sesión no se entra", async () => {
    const doc = await compra(100);
    const cuerpo = {
      operacion: "compra",
      sucursalId: emp.sucursalId,
      terceroId: proveedorId,
      fecha: "2026-10-10",
      cuentaPagoId: cajaId,
      aplicaciones: [{ documentoId: doc.id, monto: "10" }],
    };
    expect((await pedir("POST", "/abonos", CONSULTA, cuerpo)).status).toBe(403);
    expect((await pedir("POST", "/abonos", null, cuerpo)).status).toBe(401);
    expect((await pedir("POST", "/abonos", AUXILIAR, cuerpo)).status).toBe(201);
  });

  it("la cuenta de pago debe ser de efectivo y el tercero del rol correcto", async () => {
    const doc = await compra(100);
    const r = await abono("compra", [{ documentoId: doc.id, monto: "10" }], { cuentaPagoId: cuentaGasto });
    expect(r.status).toBe(422);
    const r2 = await abono("compra", [{ documentoId: doc.id, monto: "10" }], { terceroId: clienteId });
    expect(r2.status).toBe(422);
  });

  it("no se abona a documentos de una sucursal sin acceso ni de otra sucursal distinta a la del abono (HU-62)", async () => {
    const doc = await compra(100, { sucursalId: emp.otraSucursalId });
    const aplicaciones = [{ documentoId: doc.id, monto: "10" }];
    // El auxiliar solo tiene la matriz: ni siquiera registrando el abono en su sucursal puede tocar el documento ajeno
    const ajeno = await pedir("POST", "/abonos", AUXILIAR, {
      operacion: "compra",
      sucursalId: emp.sucursalId,
      terceroId: proveedorId,
      fecha: "2026-10-10",
      cuentaPagoId: cajaId,
      aplicaciones,
    });
    expect(ajeno.status).toBe(422);
    expect(String(ajeno.cuerpo["message"])).toMatch(/acceso a la sucursal del documento/);
    // Con acceso a todas, el abono debe registrarse en la sucursal del documento para que antigüedad y mayor cuadren
    const otraSucursal = await abono("compra", aplicaciones);
    expect(otraSucursal.status).toBe(422);
    expect(String(otraSucursal.cuerpo["message"])).toMatch(/otra sucursal/);
    expect((await abono("compra", aplicaciones, { sucursalId: emp.otraSucursalId })).status).toBe(201);
  });

  it("las partidas de los abonos cuadran y se contabilizan juntas", async () => {
    const [{ n }] = (
      await c.query(`select count(*)::int n from partidas where origen = 'abonos' and estado = 'borrador'`)
    ).rows;
    expect(n).toBeGreaterThan(0);
    await c.query(`update partidas set estado = 'contabilizada' where origen = 'abonos'`);
  });
});
