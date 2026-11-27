// Facturación electrónica (HU-53 a HU-57; S4-T04, T07, T10, T13 y T16): emitir factura, CCF y notas como DTE,
// validarlos contra el esquema de Hacienda, firmarlos, sellarlos, mostrarlos en PDF e invalidarlos.
// Usa una base propia (contable_api_dte) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, DteResumen, DteVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, errorDe, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { erroresEsquema } from "../src/modules/facturacion/domain/esquemas-dte.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let clienteId: string;
let sinNrcId: string;
let grandeId: string;
let productoId: string;
let cajaId: string;

async function pedir(metodo: string, ruta: string, usuario: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  const cuerpoRespuesta = tipo.includes("json") ? ((await r.json()) as Record<string, unknown>) : {};
  return { status: r.status, cuerpo: cuerpoRespuesta, tipo, respuesta: r };
}

const factura = (extra: Record<string, unknown> = {}) =>
  pedir("POST", "/dte/ventas", CONTADOR, {
    tipoDocumento: "factura",
    sucursalId: emp.sucursalId,
    condicionPago: "contado",
    cuentaPagoId: cajaId,
    lineas: [{ productoId, cantidad: 2, precioUnitario: 113 }],
    ...extra,
  });

const ccf = (extra: Record<string, unknown> = {}) =>
  pedir("POST", "/dte/ventas", CONTADOR, {
    tipoDocumento: "ccf",
    sucursalId: emp.sucursalId,
    terceroId: clienteId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 2, precioUnitario: 250 }],
    ...extra,
  });

const emitido = (r: Awaited<ReturnType<typeof pedir>>) => {
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo as unknown as DteVista;
};

beforeAll(async () => {
  process.env["FIRMA_SECRETO"] = "secreto-de-pruebas-de-firma-con-mas-de-32-caracteres";
  const urlBase = await basePropia("contable_api_dte");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-6");
  // El DTE se emite con la fecha de hoy: la empresa necesita el ejercicio del año en curso
  const anio = new Date().getFullYear();
  if (anio !== 2026) {
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, $2, $3, $4)`,
      [emp.empresaId, anio, `${anio}-01-01`, `${anio}-12-31`],
    );
  }
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
    nombre: "Tecno Plaza, S.A. de C.V.",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    actividadEconomica: "47411 · Venta de equipo de telefonía",
    direccion: "Av. Roosevelt, San Miguel",
    correo: "compras@tecnoplaza.test",
    esCliente: true,
  });
  sinNrcId = (
    await c.query(
      `insert into terceros (empresa_id, nombre, nit, es_cliente) values ($1, 'Juan Pérez', '0000-000000-105-1', true)
       returning id`,
      [emp.empresaId],
    )
  ).rows[0].id as string;
  grandeId = await tercero({
    nombre: "Cliente grande",
    nit: "1000-000000-009-0",
    nrc: "333333-3",
    esCliente: true,
    clasificacion: "grande",
  });
  const proveedorId = await tercero({
    nombre: "Totalynk",
    nit: "0000-000000-104-0",
    nrc: "123456-7",
    esProveedor: true,
  });
  productoId = (await pedir("POST", "/productos", CONTADOR, { codigo: "CP-01", nombre: "Galaxy A15" }))
    .cuerpo["id"] as string;
  const compra = await pedir("POST", "/compras", CONTADOR, {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: "CCF-P000",
    fecha: "2026-10-01",
    terceroId: proveedorId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad: 100, precioUnitario: 100 }],
  });
  expect(compra.status, JSON.stringify(compra.cuerpo)).toBe(201);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("datos del emisor", () => {
  it("sin NRC, dirección, teléfono ni correo de la empresa no se emite y no se registra la venta", async () => {
    const r = await factura();
    expect(r.status).toBe(422);
    expect(String(r.cuerpo["message"])).toMatch(/NRC.*dirección.*teléfono.*correo/);
    expect(
      (await c.query("select count(*)::int n from documentos_comerciales where operacion = 'venta'")).rows[0]
        .n,
    ).toBe(0);

    await c.query(
      `update empresas set nrc = '123456-7', direccion = 'Barrio El Centro, San Miguel', telefono = '2660-0000',
         correo = 'ventas@cherophonex.test', actividad_economica = '47411 · Venta de teléfonos'
       where id = $1`,
      [emp.empresaId],
    );
  });
});

describe("factura electrónica (HU-53, S4-T04)", () => {
  let dte: DteVista;

  it("emite la factura, registra la venta con el número de control y deja su partida en borrador", async () => {
    dte = emitido(await factura());
    expect(dte).toMatchObject({
      tipoDte: "01",
      nombreTipo: "Factura",
      estado: "procesado",
    });
    expect(dte.numeroControl).toMatch(/^DTE-01-M0010001-0{14}1$/);
    expect(dte.codigoGeneracion).toMatch(/^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/);
    expect(dte.selloRecepcion).toMatch(/^\d{4}[A-F0-9]{36}$/);

    const venta = (await pedir("GET", `/ventas/${dte.documentoId}`, CONTADOR))
      .cuerpo as unknown as DocumentoComercialVista;
    expect(venta).toMatchObject({
      tipoDocumento: "factura",
      numeroDocumento: dte.numeroControl,
      fecha: dte.fechaEmision,
      totalGravado: "200.00",
      iva: "26.00",
      total: "226.00",
      estadoPartida: "borrador",
    });
    expect(dte.total).toBe("226.00");
  });

  it("el JSON valida contra el esquema de Hacienda y coincide con la venta", async () => {
    expect(erroresEsquema("01", dte.documento)).toEqual([]);
    expect(dte.documento["resumen"]).toMatchObject({ totalGravada: 226, totalIva: 26, totalPagar: 226 });
    expect(dte.documento["identificacion"]).toMatchObject({
      numeroControl: dte.numeroControl,
      codigoGeneracion: dte.codigoGeneracion,
      ambiente: "00",
    });
  });

  it("el correlativo del número de control avanza sin saltos", async () => {
    const segundo = emitido(await factura({ lineas: [{ productoId, cantidad: 1, precioUnitario: 113 }] }));
    expect(segundo.numeroControl).toMatch(/-0{14}2$/);
  });

  it("un DTE emitido no se modifica ni se borra en la base", async () => {
    expect(await errorDe(c, `update documentos_electronicos set total = 1 where id = $1`, [dte.id])).toMatch(
      /no se modifica/,
    );
    expect(await errorDe(c, `delete from documentos_electronicos where id = $1`, [dte.id])).toMatch(
      /no se borra/,
    );
  });

  it("el rol de consulta ve los DTE pero no emite", async () => {
    const lista = (await pedir("GET", "/dte?tipo=01", CONSULTA)).cuerpo as unknown as DteResumen[];
    expect(lista.length).toBeGreaterThanOrEqual(2);
    expect((await factura()).status).toBe(201);
    expect((await pedir("POST", "/dte/ventas", CONSULTA, {})).status).toBe(403);
  });
});

describe("comprobante de crédito fiscal electrónico (HU-54, S4-T07)", () => {
  it("exige el NIT y el NRC del cliente", async () => {
    expect((await ccf({ terceroId: undefined })).status).toBe(400);
    expect((await ccf({ terceroId: sinNrcId })).status).toBe(422);
  });

  it("calcula el IVA y la retención del 1 % al cliente gran contribuyente", async () => {
    const dte = emitido(
      await ccf({ terceroId: grandeId, lineas: [{ productoId, cantidad: 1, precioUnitario: 1000 }] }),
    );
    expect(erroresEsquema("03", dte.documento)).toEqual([]);
    expect(dte.documento["resumen"]).toMatchObject({
      totalGravada: 1000,
      tributos: [{ codigo: "20", valor: 130 }],
      ivaRete1: 10,
      montoTotalOperacion: 1130,
      totalPagar: 1120,
    });
    expect(dte.total).toBe("1120.00");
  });
});
