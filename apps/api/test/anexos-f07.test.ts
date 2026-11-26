// Anexos del F-07 en CSV contra los libros del período (HU-51, S3-T54): se registran tres CCF de la hoja 6 y
// un resumen de consumidor final de la hoja 7 de CheroPhonex; el CSV de cada anexo debe coincidir al centavo con
// su libro, y un borrador no entra.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AnexosF07Vista,
  DocumentoComercialVista,
  LibroConsumidor,
  LibroContribuyentes,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

/** Hoja 6: [fecha, documento, NRC, cliente, gravadas, débito fiscal, total]. */
const CCF: [string, string, string, string, string, string, string][] = [
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
];
/** Hoja 7, primer resumen semanal. */
const FACTURAS = { fecha: "2026-10-10", del: "FCF-00001", al: "FCF-00015", total: "4481.92" };

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
const OCTUBRE = "desde=2026-10-01&hasta=2026-10-31";
const anexos = async (query = OCTUBRE, usuario = CONTADOR) => {
  const r = await pedir("GET", `/libros-iva/anexos-f07?${query}`, undefined, usuario);
  return { status: r.status, v: r.cuerpo as unknown as AnexosF07Vista };
};
const contabilizar = (numero: string) =>
  c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documentos.get(numero)!.partidaId]);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_anexos_f07");
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
  let n = 0;
  for (const [fecha, numero, nrc, cliente, gravado] of CCF) {
    n += 1;
    const terceroId = (
      await c.query(
        `insert into terceros (empresa_id, nombre, nit, nrc, es_cliente) values ($1, $2, $3, $4, true) returning id`,
        [emp.empresaId, cliente, `0614-0202${String(n).padStart(2, "0")}-101-${n % 10}`, nrc],
      )
    ).rows[0].id as string;
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
  const cf = await pedir("POST", "/ventas", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "factura",
    numeroDocumento: FACTURAS.del,
    numeroDocumentoHasta: FACTURAS.al,
    fecha: FACTURAS.fecha,
    condicionPago: "contado",
    cuentaPagoId: caja,
    lineas: [
      { cuentaId: ingreso, descripcion: "Facturas del día", cantidad: 1, precioUnitario: FACTURAS.total },
    ],
  });
  expect(cf.status, JSON.stringify(cf.cuerpo)).toBe(201);
  documentos.set(FACTURAS.del, cf.cuerpo as unknown as DocumentoComercialVista);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("anexos del F-07 en CSV (HU-51)", () => {
  it("con las partidas en borrador no hay registros: los borradores no entran", async () => {
    const { status, v } = await anexos();
    expect(status).toBe(200);
    expect(v.anexos.map((a) => [a.id, a.filas.length, a.errores.length, a.csv])).toEqual([
      ["compras", 0, 0, ""],
      ["contribuyentes", 0, 0, ""],
      ["consumidor", 0, 0, ""],
    ]);
  });

  it("el CSV de cada anexo coincide con su libro al centavo", async () => {
    for (const numero of [...CCF.map((f) => f[1]), FACTURAS.del]) await contabilizar(numero);
    const { v } = await anexos();
    const libroCcf = (await pedir("GET", `/libros-iva/contribuyentes?${OCTUBRE}`))
      .cuerpo as unknown as LibroContribuyentes;
    const libroCf = (await pedir("GET", `/libros-iva/consumidor-final?${OCTUBRE}`))
      .cuerpo as unknown as LibroConsumidor;

    const contribuyentes = v.anexos.find((a) => a.id === "contribuyentes")!;
    expect(contribuyentes.errores).toEqual([]);
    expect(contribuyentes.total).toBe(libroCcf.totales.ventaTotal);
    const lineas = contribuyentes.csv.split("\r\n").filter(Boolean);
    expect(lineas).toHaveLength(3);
    expect(lineas[0]).toBe(
      "08/10/2026;CCF;CCF-0001;245871-3;Tecno Plaza San Miguel, S.A. de C.V.;0.00;0.00;2740.50;356.27;0.00;0.00;3096.77",
    );
    // Sumar la última columna del archivo da el total del libro
    const sumaCsv = lineas.reduce((s, l) => s + Math.round(Number(l.split(";").at(-1)) * 100), 0);
    expect(sumaCsv).toBe(Math.round(Number(libroCcf.totales.ventaTotal) * 100));
    expect(libroCcf.totales.ventaTotal).toBe("11098.02");

    const consumidor = v.anexos.find((a) => a.id === "consumidor")!;
    expect(consumidor.errores).toEqual([]);
    expect(consumidor.total).toBe(libroCf.totales.totalVentas);
    expect(consumidor.csv).toBe("10/10/2026;FCF-00001;FCF-00015;1;0.00;0.00;3966.30;515.62;0.00;4481.92\r\n");
    expect(v.anexos.find((a) => a.id === "compras")!.filas).toEqual([]);
  });

  it("un cliente sin NRC en un CCF deja el anexo con error y sin CSV", async () => {
    await c.query(`update terceros set nrc = null where nrc = '198342-6' and empresa_id = $1`, [
      emp.empresaId,
    ]);
    const contribuyentes = (await anexos()).v.anexos.find((a) => a.id === "contribuyentes")!;
    expect(contribuyentes.csv).toBe("");
    expect(contribuyentes.errores).toHaveLength(1);
    expect(contribuyentes.errores[0]).toMatchObject({ fila: 2, columna: "NRC", referencia: "CCF CCF-0002" });
    // Los demás anexos siguen listos
    expect((await anexos()).v.anexos.find((a) => a.id === "consumidor")!.csv).not.toBe("");
  });

  it("valida el período", async () => {
    expect((await anexos("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await anexos("desde=2026-10-01")).status).toBe(400);
  });
});
