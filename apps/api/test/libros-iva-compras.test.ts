// Libro de compras contra el libro de CheroPhonex de octubre (HU-45, S3-T36): las once compras de la hoja 5 se
// registran por la API y el libro debe coincidir al centavo con sus renglones y totales. El libro solo lee
// documentos con partida contabilizada o anulada: uno en borrador no entra, uno anulado se lista sin montos.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, LibroCompras } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const AJENO = "33333333-3333-4333-8333-333333333333";

/** Hoja 5 del PDF: [fecha, tipo, documento, NRC, proveedor, concepto, clase, base, IVA, total]. */
const LIBRO: [
  string,
  "ccf" | "factura",
  string,
  string | null,
  string,
  string,
  "gravada" | "exenta",
  string,
  string,
  string,
][] = [
  [
    "2026-10-01",
    "ccf",
    "CCF-P001",
    "301245-7",
    "Totalynk El Salvador",
    "Mercadería para la venta",
    "gravada",
    "11670.00",
    "1517.10",
    "13187.10",
  ],
  [
    "2026-10-02",
    "ccf",
    "CCF-P002",
    "187652-0",
    "SP Importadora",
    "Mercadería para la venta",
    "gravada",
    "11800.00",
    "1534.00",
    "13334.00",
  ],
  [
    "2026-10-03",
    "ccf",
    "CCF-P003",
    "254398-2",
    "A1A Solutions",
    "Mercadería para la venta",
    "gravada",
    "11720.00",
    "1523.60",
    "13243.60",
  ],
  [
    "2026-10-04",
    "ccf",
    "CCF-P004",
    "299871-4",
    "Protectores por Mayor",
    "Mercadería para la venta",
    "gravada",
    "4810.00",
    "625.30",
    "5435.30",
  ],
  [
    "2026-10-05",
    "ccf",
    "CCF-A0101",
    "210457-9",
    "Inmobiliaria Roosevelt, S.A. de C.V.",
    "Alquiler del local - octubre",
    "gravada",
    "600.00",
    "78.00",
    "678.00",
  ],
  [
    "2026-10-15",
    "ccf",
    "CCF-E2231",
    "100231-4",
    "EEO, S.A. de C.V.",
    "Energía eléctrica",
    "gravada",
    "150.00",
    "19.50",
    "169.50",
  ],
  [
    "2026-10-15",
    "factura",
    "FAC-AN5587",
    null,
    "ANDA",
    "Servicio de agua",
    "exenta",
    "25.00",
    "0.00",
    "25.00",
  ],
  [
    "2026-10-15",
    "ccf",
    "CCF-T7741",
    "156320-1",
    "Telecom Oriente, S.A. de C.V.",
    "Internet y telefonía",
    "gravada",
    "60.00",
    "7.80",
    "67.80",
  ],
  [
    "2026-10-22",
    "ccf",
    "CCF-L0412",
    "213654-0",
    "Librería y Papelería San Miguel",
    "Papelería y útiles",
    "gravada",
    "50.00",
    "6.50",
    "56.50",
  ],
  [
    "2026-10-22",
    "ccf",
    "CCF-L0413",
    "213654-0",
    "Librería y Papelería San Miguel",
    "Material de aseo",
    "gravada",
    "40.00",
    "5.20",
    "45.20",
  ],
  [
    "2026-10-28",
    "ccf",
    "CCF-P0920",
    "248761-3",
    "Publicidad Oriental, S.A. de C.V.",
    "Publicidad en redes y volantes",
    "gravada",
    "200.00",
    "26.00",
    "226.00",
  ],
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
const documentos = new Map<string, DocumentoComercialVista>();

async function pedir(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  usuario = CONTADOR,
  empresaId = emp.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}
const libro = async (query: string, usuario = CONTADOR) => {
  const r = await pedir("GET", `/libros-iva/compras?${query}`, undefined, usuario);
  return { status: r.status, libro: r.cuerpo as unknown as LibroCompras };
};
const OCTUBRE = "desde=2026-10-01&hasta=2026-10-31";

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_libros_iva_compras");
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

  const gasto = (
    await c.query(
      `select cu.id from cuentas cu where cu.empresa_id = $1 and cu.tipo = 'costos_gastos' and cu.activa
         and not exists (select 1 from cuentas h where h.cuenta_padre_id = cu.id) order by cu.codigo limit 1`,
      [emp.empresaId],
    )
  ).rows[0].id as string;

  const proveedores = new Map<string, string>();
  for (const [, tipo, numero, nrc, proveedor, concepto, clase, base] of LIBRO) {
    let terceroId = proveedores.get(proveedor);
    if (!terceroId) {
      const n = proveedores.size + 1;
      terceroId = (
        await c.query(
          `insert into terceros (empresa_id, nombre, nit, nrc, es_proveedor) values ($1, $2, $3, $4, true) returning id`,
          [emp.empresaId, proveedor, `0614-0101${String(n).padStart(2, "0")}-101-${n % 10}`, nrc],
        )
      ).rows[0].id as string;
      proveedores.set(proveedor, terceroId);
    }
    const fecha = LIBRO.find((f) => f[2] === numero)![0];
    const r = await pedir("POST", "/compras", {
      sucursalId: emp.sucursalId,
      tipoDocumento: tipo,
      numeroDocumento: numero,
      fecha,
      terceroId,
      condicionPago: "credito",
      lineas: [{ cuentaId: gasto, descripcion: concepto, cantidad: 1, precioUnitario: base, clase }],
    });
    expect(r.status, `${numero} ${JSON.stringify(r.cuerpo)}`).toBe(201);
    documentos.set(numero, r.cuerpo as unknown as DocumentoComercialVista);
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

const contabilizar = (numero: string) =>
  c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documentos.get(numero)!.partidaId]);

describe("libro de compras (HU-45)", () => {
  it("con todas las partidas en borrador el libro está vacío", async () => {
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    expect(r.libro.filas).toEqual([]);
    expect(r.libro.totales.totalCompras).toBe("0.00");
  });

  it("solo entran las compras con partida contabilizada", async () => {
    await contabilizar("CCF-P001");
    const r = await libro(OCTUBRE);
    expect(r.libro.filas.map((f) => f.numeroDocumento)).toEqual(["CCF-P001"]);
  });

  it("las once compras de octubre coinciden con el libro de CheroPhonex al centavo", async () => {
    for (const [, , numero] of LIBRO) await contabilizar(numero);
    const r = await libro(OCTUBRE);
    expect(r.status).toBe(200);
    expect(r.libro.filas).toHaveLength(11);
    expect(r.libro.totales).toEqual({
      comprasExentas: "25.00",
      comprasNoSujetas: "0.00",
      comprasGravadas: "41100.00",
      creditoFiscal: "5343.00",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      totalCompras: "46468.00",
    });
    // Renglón por renglón: la hoja 5 (el libro ordena por fecha y número, el PDF por orden de registro)
    for (const [fecha, tipo, numero, nrc, proveedor, concepto, clase, base, iva, total] of LIBRO) {
      expect(
        r.libro.filas.find((f) => f.numeroDocumento === numero),
        numero,
      ).toMatchObject({
        fecha,
        tipoDocumento: tipo,
        nrcProveedor: nrc,
        proveedor,
        concepto,
        comprasExentas: clase === "exenta" ? base : "0.00",
        comprasGravadas: clase === "gravada" ? base : "0.00",
        creditoFiscal: iva,
        totalCompras: total,
        anulado: false,
      });
    }
    expect(r.libro.filas.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("el período limita los renglones y no hay compras fuera de octubre", async () => {
    const primera = await libro("desde=2026-10-01&hasta=2026-10-04");
    expect(primera.libro.filas).toHaveLength(4);
    expect(primera.libro.totales.creditoFiscal).toBe("5200.00");
    const noviembre = await libro("desde=2026-11-01&hasta=2026-11-30");
    expect(noviembre.libro.filas).toEqual([]);
  });

  it("una compra con la partida anulada queda en el libro sin montos", async () => {
    const doc = documentos.get("CCF-L0413")!;
    const r = await pedir("POST", `/partidas/${doc.partidaId}/anular`, {
      motivo: "Documento duplicado",
      fecha: "2026-10-25",
    });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const l = (await libro(OCTUBRE)).libro;
    const fila = l.filas.find((f) => f.numeroDocumento === "CCF-L0413")!;
    expect(fila).toMatchObject({ anulado: true, creditoFiscal: "0.00", totalCompras: "0.00" });
    expect(l.filas).toHaveLength(11);
    expect(l.totales.creditoFiscal).toBe("5337.80");
    expect(l.totales.totalCompras).toBe("46422.80");
  });

  it("valida el período y la sucursal", async () => {
    expect((await libro("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await libro("desde=2026-10-01")).status).toBe(400);
    expect((await libro(`${OCTUBRE}&sucursalId=${emp.otraSucursalId}`)).libro.filas).toEqual([]);
    expect((await libro(`${OCTUBRE}&sucursalId=${emp.sucursalId}`)).libro.filas).toHaveLength(11);
  });

  it("quien solo ve otra sucursal no recibe las compras de la matriz", async () => {
    expect((await libro(OCTUBRE, AUXILIAR)).libro.filas).toEqual([]);
    expect((await libro(`${OCTUBRE}&sucursalId=${emp.sucursalId}`, AUXILIAR)).status).toBe(403);
  });

  it("un usuario ajeno a la empresa no la ve", async () => {
    expect((await libro(OCTUBRE, AJENO)).status).toBe(404);
  });
});
