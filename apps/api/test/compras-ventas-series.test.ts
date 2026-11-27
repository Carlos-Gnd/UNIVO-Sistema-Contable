// Costo específico por número de serie desde compras y ventas (HU-66): la serie se registra en la compra,
// se elige en la venta y el costo de ventas es el de esa unidad exacta.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, SerieInventarioVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let clienteId: string;
let proveedorId: string;
let productoId: string;
let cajaId: string;

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const compra = (numero: string, fecha: string, cantidad: number, costo: number, series?: string[]) =>
  pedir("POST", "/compras", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: numero,
    fecha,
    terceroId: proveedorId,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad, precioUnitario: costo, ...(series ? { series } : {}) }],
  });

const venta = (numero: string, fecha: string, series: string[], precio = 900) =>
  pedir("POST", "/ventas", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: numero,
    fecha,
    terceroId: clienteId,
    condicionPago: "contado",
    cuentaPagoId: cajaId,
    lineas: [{ productoId, cantidad: series.length, precioUnitario: precio, series }],
  });

const seriesDe = async (estado: string) =>
  (await pedir("GET", `/productos/${productoId}/series?sucursalId=${emp.sucursalId}&estado=${estado}`))
    .cuerpo as unknown as SerieInventarioVista[];

const lineas = async (partidaId: string | null) =>
  (
    await c.query(
      `select cu.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas cu on cu.id = d.cuenta_id
       where d.partida_id = $1 order by d.orden`,
      [partidaId],
    )
  ).rows.map((f) => [f.codigo, f.debe, f.haber]);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_compras_ventas_series");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  await crearUsuario(c, CONTADOR, 2, emp);
  cajaId = await emp.cuenta("110101");
  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({ verificarToken: async (t: string) => (/^[0-9a-f-]{36}$/.test(t) ? { id: t } : null) })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  const tercero = async (cuerpo: Record<string, unknown>) => {
    const r = await pedir("POST", "/terceros", cuerpo);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo["id"] as string;
  };
  clienteId = await tercero({
    nombre: "Tecno Plaza",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    esCliente: true,
  });
  proveedorId = await tercero({
    nombre: "Totalynk",
    nit: "0000-000000-104-0",
    nrc: "123456-7",
    esProveedor: true,
  });
  const p = await pedir("POST", "/productos", {
    codigo: "CEL-S24",
    nombre: "Samsung Galaxy S24",
    controlaSeries: true,
  });
  expect(p.status, JSON.stringify(p.cuerpo)).toBe(201);
  productoId = p.cuerpo["id"] as string;
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("compra con series", () => {
  it("rechaza una compra con una cantidad distinta al número de series", async () => {
    const r = await compra("CCF-P000", "2026-10-01", 3, 590, ["IMEI-X1", "IMEI-X2"]);
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.cuerpo)).toMatch(/una serie por cada unidad/);
    expect((await seriesDe("todas")).length).toBe(0);
  });

  it("registra la serie de cada unidad con el costo de su compra", async () => {
    {
      const r1 = await compra("CCF-P001", "2026-10-01", 2, 590, ["IMEI-A", "IMEI-B"]);
      expect(r1.status, JSON.stringify(r1.cuerpo)).toBe(201);
    }
    expect((await compra("CCF-P002", "2026-10-02", 1, 650, ["IMEI-C"])).status).toBe(201);
    const enExistencia = await seriesDe("en_existencia");
    expect(enExistencia.map((s) => [s.numeroSerie, s.costoUnitario]).sort()).toEqual([
      ["IMEI-A", "590.00"],
      ["IMEI-B", "590.00"],
      ["IMEI-C", "650.00"],
    ]);
  });

  it("no admite repetir una serie ya registrada en la empresa", async () => {
    const r = await compra("CCF-P003", "2026-10-03", 1, 600, ["IMEI-A"]);
    expect(r.status).toBe(409);
  });
});

describe("venta eligiendo la serie", () => {
  it("el costo de ventas es el costo exacto de la unidad elegida, no el promedio", async () => {
    // Promedio ponderado sería 610.00; la unidad IMEI-C costó 650.00
    const r = await venta("CCF-0001", "2026-10-08", ["IMEI-C"]);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as DocumentoComercialVista & { partidaCostoId: string };
    expect(await lineas(doc.partidaCostoId)).toEqual([
      ["4104", "650.00", "0.00"],
      ["1109", "0.00", "650.00"],
    ]);
    const vendidas = await seriesDe("vendidas");
    expect(vendidas.map((s) => s.numeroSerie)).toEqual(["IMEI-C"]);
    expect((await seriesDe("en_existencia")).map((s) => s.numeroSerie).sort()).toEqual(["IMEI-A", "IMEI-B"]);
  });

  it("una serie ya vendida no puede venderse otra vez, y una inexistente se rechaza", async () => {
    const repetida = await venta("CCF-0002", "2026-10-09", ["IMEI-C"]);
    expect(repetida.status).toBeGreaterThanOrEqual(400);
    expect(repetida.status).toBeLessThan(500);
    const inexistente = await venta("CCF-0003", "2026-10-09", ["IMEI-NO-EXISTE"]);
    expect(inexistente.status).toBeGreaterThanOrEqual(400);
    expect(inexistente.status).toBeLessThan(500);
    // Nada quedó a medias: siguen las dos unidades en existencia y una sola venta
    expect((await seriesDe("en_existencia")).length).toBe(2);
    const ventas = await c.query(
      `select count(*)::int n from documentos_comerciales where empresa_id = $1 and operacion = 'venta'`,
      [emp.empresaId],
    );
    expect(ventas.rows[0].n).toBe(1);
  });

  it("vender dos unidades elegidas suma el costo de cada una", async () => {
    const r = await venta("CCF-0004", "2026-10-10", ["IMEI-A", "IMEI-B"]);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as { partidaCostoId: string };
    expect(await lineas(doc.partidaCostoId)).toEqual([
      ["4104", "1180.00", "0.00"],
      ["1109", "0.00", "1180.00"],
    ]);
    expect((await seriesDe("en_existencia")).length).toBe(0);
  });

  it("sin existencias no se puede vender ninguna serie", async () => {
    expect((await venta("CCF-0005", "2026-10-11", ["IMEI-A"])).status).toBeGreaterThanOrEqual(400);
  });
});
