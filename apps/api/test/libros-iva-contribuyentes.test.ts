// Libro de ventas a contribuyentes contra el de CheroPhonex de octubre (HU-46, S3-T39): los ocho CCF de la hoja 6
// se registran por la API y el libro debe coincidir al centavo con sus renglones y totales (débito fiscal de
// US$ 3,331.00). Solo entran CCF con partida contabilizada o anulada; no entran las compras ni el consumidor final.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, LibroContribuyentes } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

/** Hoja 6 del PDF: [fecha, documento, NRC, cliente, ventas gravadas, débito fiscal, venta total]. */
const LIBRO: [string, string, string, string, string, string, string][] = [
  [
    "2026-10-08",
    "CCF-0001",
    "245871-3",
    "Tecno Plaza San Miguel, S.A. de C.V.",
    "2740.50",
    "356.27",
    "3096.77",
  ],
  [
    "2026-10-10",
    "CCF-0002",
    "198342-6",
    "Celulares El Oriente, S.A. de C.V.",
    "3152.25",
    "409.79",
    "3562.04",
  ],
  [
    "2026-10-15",
    "CCF-0003",
    "276510-1",
    "Comercial Chaparrastique, S.A. de C.V.",
    "3928.50",
    "510.71",
    "4439.21",
  ],
  [
    "2026-10-17",
    "CCF-0004",
    "231984-8",
    "Distribuidora La Ceiba, S.A. de C.V.",
    "4627.80",
    "601.61",
    "5229.41",
  ],
  ["2026-10-22", "CCF-0005", "264017-5", "MultiCell Usulután, S.A. de C.V.", "2218.05", "288.35", "2506.40"],
  [
    "2026-10-24",
    "CCF-0006",
    "245871-3",
    "Tecno Plaza San Miguel, S.A. de C.V.",
    "2582.55",
    "335.73",
    "2918.28",
  ],
  [
    "2026-10-29",
    "CCF-0007",
    "198342-6",
    "Celulares El Oriente, S.A. de C.V.",
    "3325.05",
    "432.26",
    "3757.31",
  ],
  [
    "2026-10-31",
    "CCF-0008",
    "276510-1",
    "Comercial Chaparrastique, S.A. de C.V.",
    "3048.30",
    "396.28",
    "3444.58",
  ],
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
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
  const r = await pedir("GET", `/libros-iva/contribuyentes?${query}`, undefined, usuario);
  return { status: r.status, libro: r.cuerpo as unknown as LibroContribuyentes };
};
const OCTUBRE = "desde=2026-10-01&hasta=2026-10-31";
const contabilizar = (numero: string) =>
  c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documentos.get(numero)!.partidaId]);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_libros_iva_contribuyentes");
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
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, '510101', 'Ventas a contribuyentes', 'acreedora', 'ingresos')`,
    [emp.empresaId],
  );
  const ingreso = await emp.cuenta("510101");
  const caja = await emp.cuenta("110101");
  const clientes = new Map<string, string>();
  for (const [fecha, numero, nrc, cliente, gravado] of LIBRO) {
    let terceroId = clientes.get(nrc);
    if (!terceroId) {
      const n = clientes.size + 1;
      terceroId = (
        await c.query(
          `insert into terceros (empresa_id, nombre, nit, nrc, es_cliente) values ($1, $2, $3, $4, true) returning id`,
          [emp.empresaId, cliente, `0614-0202${String(n).padStart(2, "0")}-101-${n % 10}`, nrc],
        )
      ).rows[0].id as string;
      clientes.set(nrc, terceroId);
    }
    const r = await pedir("POST", "/ventas", {
      sucursalId: emp.sucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: numero,
      fecha,
      terceroId,
      condicionPago: "contado",
      cuentaPagoId: caja,
      lineas: [{ cuentaId: ingreso, descripcion: "Venta de equipos", cantidad: 1, precioUnitario: gravado }],
    });
    expect(r.status, `${numero} ${JSON.stringify(r.cuerpo)}`).toBe(201);
    documentos.set(numero, r.cuerpo as unknown as DocumentoComercialVista);
  }
  // Una factura de consumidor final y una exportación: no son del libro de contribuyentes
  const cf = await pedir("POST", "/ventas", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "factura",
    numeroDocumento: "FCF-00001",
    numeroDocumentoHasta: "FCF-00015",
    fecha: "2026-10-10",
    condicionPago: "contado",
    cuentaPagoId: caja,
    lineas: [{ cuentaId: ingreso, descripcion: "Facturas del día", cantidad: 1, precioUnitario: "4481.92" }],
  });
  expect(cf.status, JSON.stringify(cf.cuerpo)).toBe(201);
  documentos.set("FCF-00001", cf.cuerpo as unknown as DocumentoComercialVista);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("libro de ventas a contribuyentes (HU-46)", () => {
  it("con todas las partidas en borrador el libro está vacío", async () => {
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    expect(r.libro.filas).toEqual([]);
    expect(r.libro.totales.debitoFiscal).toBe("0.00");
  });

  it("los ocho CCF de octubre coinciden con el libro de CheroPhonex al centavo", async () => {
    for (const [, numero] of LIBRO) await contabilizar(numero);
    await contabilizar("FCF-00001");
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    expect(r.libro.filas).toHaveLength(8);
    expect(r.libro.totales).toEqual({
      ventasExentas: "0.00",
      ventasNoSujetas: "0.00",
      ventasGravadas: "25623.00",
      debitoFiscal: "3331.00",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      ventaTotal: "28954.00",
    });
    for (const [fecha, numero, nrc, cliente, gravado, iva, total] of LIBRO) {
      expect(
        r.libro.filas.find((f) => f.numeroDocumento === numero),
        numero,
      ).toMatchObject({
        fecha,
        tipoDocumento: "ccf",
        nrcCliente: nrc,
        cliente,
        ventasGravadas: gravado,
        debitoFiscal: iva,
        ivaRetenido: "0.00",
        ventaTotal: total,
        anulado: false,
      });
    }
    expect(r.libro.filas.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("no incluye las facturas de consumidor final", async () => {
    const r = await libro(OCTUBRE);
    expect(r.libro.filas.some((f) => f.numeroDocumento.startsWith("FCF"))).toBe(false);
  });

  it("el período limita los renglones", async () => {
    const quincena = await libro("desde=2026-10-01&hasta=2026-10-15");
    expect(quincena.libro.filas.map((f) => f.numeroDocumento)).toEqual(["CCF-0001", "CCF-0002", "CCF-0003"]);
    expect(quincena.libro.totales.debitoFiscal).toBe("1276.77");
    expect((await libro("desde=2026-11-01&hasta=2026-11-30")).libro.filas).toEqual([]);
  });

  it("un CCF con la partida anulada queda en el libro sin montos", async () => {
    const doc = documentos.get("CCF-0008")!;
    const r = await pedir("POST", `/partidas/${doc.partidaId}/anular`, {
      motivo: "Documento mal emitido",
      fecha: "2026-10-31",
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const l = (await libro(OCTUBRE)).libro;
    expect(l.filas.find((f) => f.numeroDocumento === "CCF-0008")).toMatchObject({
      anulado: true,
      debitoFiscal: "0.00",
      ventaTotal: "0.00",
    });
    expect(l.filas).toHaveLength(8);
    expect(l.totales.debitoFiscal).toBe("2934.72");
  });

  it("valida el período y respeta las sucursales del usuario", async () => {
    expect((await libro("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await libro(`${OCTUBRE}&sucursalId=${emp.otraSucursalId}`)).libro.filas).toEqual([]);
    expect((await libro(OCTUBRE, AUXILIAR)).libro.filas).toEqual([]);
    expect((await libro(`${OCTUBRE}&sucursalId=${emp.sucursalId}`, AUXILIAR)).status).toBe(403);
  });
});
