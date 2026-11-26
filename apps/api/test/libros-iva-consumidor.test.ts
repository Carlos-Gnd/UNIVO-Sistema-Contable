// Libro de ventas a consumidor final contra el de CheroPhonex de octubre (HU-47, S3-T42): los cuatro resúmenes
// semanales de la hoja 7 se registran por la API (del primer al último número de factura) y el libro debe
// coincidir al centavo: ventas gravadas de US$ 20,428.20 e IVA incluido de US$ 2,655.67.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, LibroConsumidor } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

/** Hoja 7 del PDF: [fecha, del, al, ventas gravadas, IVA incluido, total ventas]. */
const LIBRO: [string, string, string, string, string, string][] = [
  ["2026-10-10", "FCF-00001", "FCF-00015", "3966.30", "515.62", "4481.92"],
  ["2026-10-17", "FCF-00016", "FCF-00032", "4999.05", "649.88", "5648.93"],
  ["2026-10-24", "FCF-00033", "FCF-00049", "6470.55", "841.17", "7311.72"],
  ["2026-10-31", "FCF-00050", "FCF-00065", "4992.30", "649.00", "5641.30"],
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let ingreso: string;
let caja: string;
const documentos = new Map<string, DocumentoComercialVista>();

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}
const libro = async (query: string, usuario = CONTADOR) => {
  const r = await pedir("GET", `/libros-iva/consumidor-final?${query}`, undefined, usuario);
  return { status: r.status, libro: r.cuerpo as unknown as LibroConsumidor };
};
const OCTUBRE = "desde=2026-10-01&hasta=2026-10-31";
const contabilizar = (numero: string) =>
  c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documentos.get(numero)!.partidaId]);

async function registrarFactura(
  fecha: string,
  del: string,
  al: string | null,
  precio: string,
  sucursalId = emp.sucursalId,
) {
  const r = await pedir("POST", "/ventas", {
    sucursalId,
    tipoDocumento: "factura",
    numeroDocumento: del,
    ...(al ? { numeroDocumentoHasta: al } : {}),
    fecha,
    condicionPago: "contado",
    cuentaPagoId: caja,
    lineas: [
      { cuentaId: ingreso, descripcion: "Facturas de consumidor final", cantidad: 1, precioUnitario: precio },
    ],
  });
  expect(r.status, `${del} ${JSON.stringify(r.cuerpo)}`).toBe(201);
  documentos.set(del, r.cuerpo as unknown as DocumentoComercialVista);
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_libros_iva_consumidor");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.otraSucursalId]);

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

  await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, '510102', 'Ventas a consumidor final', 'acreedora', 'ingresos')`,
    [emp.empresaId],
  );
  ingreso = await emp.cuenta("510102");
  caja = await emp.cuenta("110101");
  for (const [fecha, del, al, , , total] of LIBRO) await registrarFactura(fecha, del, al, total);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("libro de ventas a consumidor final (HU-47)", () => {
  it("con todas las partidas en borrador el libro está vacío", async () => {
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    expect(r.libro.filas).toEqual([]);
    expect(r.libro.totales.totalVentas).toBe("0.00");
  });

  it("los cuatro resúmenes de octubre coinciden con el libro de CheroPhonex al centavo", async () => {
    for (const [, del] of LIBRO) await contabilizar(del);
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    expect(r.libro.filas).toHaveLength(4);
    expect(r.libro.totales).toEqual({
      ventasExentas: "0.00",
      ventasNoSujetas: "0.00",
      ventasGravadas: "20428.20",
      ivaIncluido: "2655.67",
      exportaciones: "0.00",
      totalVentas: "23083.87",
    });
    for (const [i, [fecha, del, al, gravado, iva, total]] of LIBRO.entries()) {
      expect(r.libro.filas[i]).toMatchObject({
        numero: i + 1,
        fecha,
        del,
        al,
        ventasGravadas: gravado,
        ivaIncluido: iva,
        exportaciones: "0.00",
        totalVentas: total,
      });
    }
  });

  it("las facturas del mismo día y sucursal forman un solo renglón con su rango", async () => {
    await registrarFactura("2026-11-03", "FCF-00066", null, "113.00");
    await registrarFactura("2026-11-03", "FCF-00067", "FCF-00070", "226.00");
    await registrarFactura("2026-11-03", "FCF-00071", null, "56.50", emp.otraSucursalId);
    for (const n of ["FCF-00066", "FCF-00067", "FCF-00071"]) await contabilizar(n);
    const r = (await libro("desde=2026-11-01&hasta=2026-11-30")).libro;
    expect(r.filas).toHaveLength(2);
    expect(r.filas.find((f) => f.sucursal === "Casa matriz")).toMatchObject({
      del: "FCF-00066",
      al: "FCF-00070",
      documentos: 2,
      ventasGravadas: "300.00",
      ivaIncluido: "39.00",
      totalVentas: "339.00",
    });
    const usulutan = (await libro(`desde=2026-11-01&hasta=2026-11-30&sucursalId=${emp.otraSucursalId}`))
      .libro;
    expect(usulutan.filas).toHaveLength(1);
    expect(usulutan.totales.totalVentas).toBe("56.50");
  });

  it("una exportación se suma en su columna y no en las ventas exentas", async () => {
    const r = await pedir("POST", "/ventas", {
      sucursalId: emp.sucursalId,
      tipoDocumento: "exportacion",
      numeroDocumento: "EXP-0001",
      fecha: "2026-12-02",
      condicionPago: "contado",
      cuentaPagoId: caja,
      lineas: [{ cuentaId: ingreso, descripcion: "Exportación", cantidad: 1, precioUnitario: "500.00" }],
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    documentos.set("EXP-0001", r.cuerpo as unknown as DocumentoComercialVista);
    await contabilizar("EXP-0001");
    const l = (await libro("desde=2026-12-01&hasta=2026-12-31")).libro;
    expect(l.filas).toHaveLength(1);
    expect(l.filas[0]).toMatchObject({
      exportaciones: "500.00",
      ventasExentas: "0.00",
      ventasGravadas: "0.00",
      totalVentas: "500.00",
    });
  });

  it("un resumen con la partida anulada sale del total pero deja su rango", async () => {
    const doc = documentos.get("FCF-00050")!;
    const r = await pedir("POST", `/partidas/${doc.partidaId}/anular`, {
      motivo: "Resumen duplicado",
      fecha: "2026-10-31",
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const l = (await libro(OCTUBRE)).libro;
    expect(l.filas[3]).toMatchObject({
      del: "FCF-00050",
      al: "FCF-00065",
      totalVentas: "0.00",
      ventasGravadas: "0.00",
    });
    expect(l.totales.totalVentas).toBe("17442.57");
    expect(l.totales.ivaIncluido).toBe("2006.67");
  });

  it("valida el período y respeta las sucursales del usuario", async () => {
    expect((await libro("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await libro(OCTUBRE, AUXILIAR)).libro.filas).toEqual([]);
    expect((await libro(`${OCTUBRE}&sucursalId=${emp.sucursalId}`, AUXILIAR)).status).toBe(403);
  });
});
