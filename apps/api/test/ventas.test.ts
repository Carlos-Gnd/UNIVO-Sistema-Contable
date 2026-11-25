// Registro de ventas (HU-60, S3-T64 y S3-T66): kardex, IVA, cuentas por cobrar, partida de venta y de costo de ventas.
// Usa una base propia (contable_api_ventas) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { DocumentoComercialVista, KardexVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let ajena: EmpresaComercial;
let clienteId: string;
let grandeId: string;
let sinNrcId: string;
let productoId: string;
let cajaId: string;

async function pedir(
  metodo: string,
  ruta: string,
  usuario: string | null,
  cuerpo?: unknown,
  empresa = emp.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresa}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const tercero = async (cuerpo: Record<string, unknown>) => {
  const r = await pedir("POST", "/terceros", CONTADOR, cuerpo);
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo["id"] as string;
};

const venta = (extra: Record<string, unknown> = {}) => ({
  sucursalId: emp.sucursalId,
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-0001",
  fecha: "2026-10-08",
  terceroId: clienteId,
  condicionPago: "contado",
  cuentaPagoId: cajaId,
  lineas: [{ productoId, cantidad: 1, precioUnitario: 2740.5 }],
  ...extra,
});

const comprarExistencias = async (cantidad: number, costo: number, numero: string, fecha = "2026-10-01") => {
  const proveedor = (await pedir("GET", "/terceros?rol=proveedor", CONTADOR)).cuerpo as unknown as {
    id: string;
  }[];
  const r = await pedir("POST", "/compras", CONTADOR, {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: numero,
    fecha,
    terceroId: proveedor[0]!.id,
    condicionPago: "credito",
    lineas: [{ productoId, cantidad, precioUnitario: costo }],
  });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
};

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

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_ventas");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  ajena = await crearEmpresaComercial(c, "0614-150390-101-8");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.sucursalId]);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.sucursalId]);
  await crearUsuario(c, FORASTERO, 2, ajena);
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

  clienteId = await tercero({
    nombre: "Tecno Plaza San Miguel",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    esCliente: true,
    diasCredito: 15,
  });
  grandeId = await tercero({
    nombre: "Cliente grande",
    nit: "1000-000000-009-0",
    nrc: "333333-3",
    esCliente: true,
    clasificacion: "grande",
  });
  sinNrcId = await tercero({ nombre: "Sin NRC", nit: "0000-000000-011-5", esCliente: true });
  await tercero({ nombre: "Totalynk", nit: "0000-000000-104-0", nrc: "123456-7", esProveedor: true });
  const p = await pedir("POST", "/productos", CONTADOR, {
    codigo: "CP-01",
    nombre: "Samsung Galaxy S24 256 GB",
  });
  productoId = p.cuerpo["id"] as string;
  await comprarExistencias(10, 590, "CCF-P001");
}, 60_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("venta al contado con CCF", () => {
  let doc: DocumentoComercialVista;

  it("genera la partida de venta y la del costo de ventas, y saca la mercadería del kardex", async () => {
    const r = await pedir("POST", "/ventas", AUXILIAR, venta());
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      operacion: "venta",
      totalGravado: "2740.50",
      iva: "356.27",
      total: "3096.77",
      totalNeto: "3096.77",
      estadoPartida: "borrador",
    });
    expect(doc.lineas[0]).toMatchObject({ costoKardex: "590.00", monto: "2740.50" });
    expect(await lineas(doc.partidaId)).toEqual([
      ["110101", "3096.77", "0.00"],
      ["5101", "0.00", "2740.50"],
      ["2109", "0.00", "356.27"],
    ]);
    expect(await lineas(doc.partidaCostoId)).toEqual([
      ["4104", "590.00", "0.00"],
      ["1109", "0.00", "590.00"],
    ]);
  });

  it("ambas partidas enlazan el documento, nacen en borrador y se contabilizan porque cuadran", async () => {
    const filas = (
      await c.query(
        `select origen, estado, origen_id, documento_numero from partidas where id = any($1::uuid[]) order by origen`,
        [[doc.partidaId, doc.partidaCostoId]],
      )
    ).rows;
    expect(filas).toEqual([
      { origen: "ventas", estado: "borrador", origen_id: doc.id, documento_numero: "CCF-0001" },
      { origen: "ventas_costo", estado: "borrador", origen_id: doc.id, documento_numero: "CCF-0001" },
    ]);
    await c.query(`update partidas set estado = 'contabilizada' where id = any($1::uuid[])`, [
      [doc.partidaId, doc.partidaCostoId],
    ]);
  });

  it("el kardex queda con la salida valuada y su referencia", async () => {
    const k = (await pedir("GET", `/productos/${productoId}/kardex?sucursalId=${emp.sucursalId}`, CONTADOR))
      .cuerpo as unknown as KardexVista;
    expect(k.totales).toMatchObject({ salidaCantidad: "1.0000", salidaTotal: "590.00" });
    const [m] = (
      await c.query(
        `select referencia, tipo::text from movimientos_inventario where tipo = 'salida' and producto_id = $1`,
        [productoId],
      )
    ).rows;
    expect(m).toMatchObject({ referencia: "CCF-0001", tipo: "salida" });
  });
});

describe("otras formas de venta", () => {
  it("al crédito deja la cuenta por cobrar con el plazo del cliente", async () => {
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        numeroDocumento: "CCF-0002",
        fecha: "2026-10-10",
        condicionPago: "credito",
        cuentaPagoId: undefined,
        lineas: [{ productoId, cantidad: 2, precioUnitario: 800 }],
      }),
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      condicionPago: "credito",
      diasCredito: 15,
      fechaVencimiento: "2026-10-25",
      total: "1808.00",
    });
    expect(await lineas(doc.partidaId)).toEqual([
      ["1103", "1808.00", "0.00"],
      ["5101", "0.00", "1600.00"],
      ["2109", "0.00", "208.00"],
    ]);
    expect(await lineas(doc.partidaCostoId)).toEqual([
      ["4104", "1180.00", "0.00"],
      ["1109", "0.00", "1180.00"],
    ]);
  });

  it("la factura de consumidor final separa el IVA del precio y admite un resumen de números", async () => {
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        tipoDocumento: "factura",
        numeroDocumento: "FCF-00001",
        numeroDocumentoHasta: "FCF-00015",
        terceroId: undefined,
        fecha: "2026-10-12",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 904 }],
      }),
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      tercero: null,
      numeroDocumentoHasta: "FCF-00015",
      totalGravado: "800.00",
      iva: "104.00",
      total: "904.00",
    });
    expect(await lineas(doc.partidaId)).toEqual([
      ["110101", "904.00", "0.00"],
      ["5101", "0.00", "800.00"],
      ["2109", "0.00", "104.00"],
    ]);
    const [p] = (await c.query(`select concepto from partidas where id = $1`, [doc.partidaId])).rows;
    expect(p.concepto).toBe("Venta a consumidor final según factura FCF-00001 al FCF-00015");
  });

  it("la exportación no lleva IVA y queda exenta", async () => {
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        tipoDocumento: "exportacion",
        numeroDocumento: "FEX-0001",
        fecha: "2026-10-13",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 700 }],
      }),
    );
    expect(r.cuerpo).toMatchObject({
      tipoDocumento: "exportacion",
      totalGravado: "0.00",
      totalExento: "700.00",
      iva: "0.00",
      total: "700.00",
    });
  });

  it("un servicio sin producto acredita su cuenta de ingreso, sin costo de ventas", async () => {
    const ingreso = (
      await c.query(`select id from cuentas where empresa_id = $1 and codigo = '5101'`, [emp.empresaId])
    ).rows[0].id as string;
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        numeroDocumento: "CCF-0003",
        fecha: "2026-10-14",
        lineas: [{ cuentaId: ingreso, descripcion: "Servicio técnico", cantidad: 1, precioUnitario: 50 }],
      }),
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    expect((r.cuerpo as unknown as DocumentoComercialVista).partidaCostoId).toBeNull();
  });
});

describe("retención y percepción del 1 % de IVA", () => {
  it("un cliente gran contribuyente retiene el 1 %: cobra el total menos la retención y queda IVA retenido por recuperar", async () => {
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        terceroId: grandeId,
        numeroDocumento: "CCF-0004",
        fecha: "2026-10-15",
        lineas: [{ productoId, cantidad: 1, precioUnitario: 1000 }],
      }),
    );
    const doc = r.cuerpo as unknown as DocumentoComercialVista;
    expect(doc).toMatchObject({
      iva: "130.00",
      ivaRetenido: "10.00",
      total: "1130.00",
      totalNeto: "1120.00",
    });
    expect(await lineas(doc.partidaId)).toEqual([
      ["110101", "1120.00", "0.00"],
      ["111302", "10.00", "0.00"],
      ["5101", "0.00", "1000.00"],
      ["2109", "0.00", "130.00"],
    ]);
  });

  it("una empresa gran contribuyente percibe el 1 % al vender a quien no lo es", async () => {
    await c.query(`update empresas set clasificacion = 'grande' where id = $1`, [emp.empresaId]);
    try {
      const r = await pedir(
        "POST",
        "/ventas",
        CONTADOR,
        venta({
          numeroDocumento: "CCF-0005",
          fecha: "2026-10-16",
          lineas: [{ productoId, cantidad: 1, precioUnitario: 1000 }],
        }),
      );
      const doc = r.cuerpo as unknown as DocumentoComercialVista;
      expect(doc).toMatchObject({ ivaPercibido: "10.00", total: "1140.00" });
      expect(await lineas(doc.partidaId)).toEqual([
        ["110101", "1140.00", "0.00"],
        ["5101", "0.00", "1000.00"],
        ["2109", "0.00", "130.00"],
        ["211001", "0.00", "10.00"],
      ]);
    } finally {
      await c.query(`update empresas set clasificacion = 'otro' where id = $1`, [emp.empresaId]);
    }
  });
});

describe("la percepción solo cubre los bienes (art. 163 CT)", () => {
  it("en una venta de bienes y servicios percibe el 1 % solo sobre los bienes", async () => {
    await c.query(`update empresas set clasificacion = 'grande' where id = $1`, [emp.empresaId]);
    try {
      const ingreso = (
        await c.query(`select id from cuentas where empresa_id = $1 and codigo = '5101'`, [emp.empresaId])
      ).rows[0].id as string;
      const r = await pedir(
        "POST",
        "/ventas",
        CONTADOR,
        venta({
          numeroDocumento: "CCF-0006",
          fecha: "2026-10-17",
          lineas: [
            { productoId, cantidad: 1, precioUnitario: 600 },
            { cuentaId: ingreso, descripcion: "Instalación", cantidad: 1, precioUnitario: 400 },
          ],
        }),
      );
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
      expect(r.cuerpo).toMatchObject({ ivaPercibido: "6.00", iva: "130.00", total: "1136.00" });
    } finally {
      await c.query(`update empresas set clasificacion = 'otro' where id = $1`, [emp.empresaId]);
    }
  });
});

describe("no se vende sin existencias", () => {
  it("rechaza una venta mayor que las existencias y no deja documento, partidas ni movimientos", async () => {
    const antes = (
      await c.query(
        `select (select count(*) from documentos_comerciales)::int d, (select count(*) from partidas)::int p, (select count(*) from movimientos_inventario)::int m`,
      )
    ).rows[0];
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        numeroDocumento: "CCF-9001",
        fecha: "2026-10-20",
        lineas: [{ productoId, cantidad: 500, precioUnitario: 800 }],
      }),
    );
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/Existencia insuficiente/);
    const despues = (
      await c.query(
        `select (select count(*) from documentos_comerciales)::int d, (select count(*) from partidas)::int p, (select count(*) from movimientos_inventario)::int m`,
      )
    ).rows[0];
    expect(despues).toEqual(antes);
  });

  it("la segunda línea del mismo producto cuenta con lo que ya sacó la primera", async () => {
    const r = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({
        numeroDocumento: "CCF-9002",
        fecha: "2026-10-20",
        lineas: [
          { productoId, cantidad: 3, precioUnitario: 800 },
          { productoId, cantidad: 50, precioUnitario: 800 },
        ],
      }),
    );
    expect(r.status).toBe(422);
  });
});

describe("con inventario analítico", () => {
  it("la compra va a Compras y la venta saca del kardex sin generar partida de costo de ventas", async () => {
    const an = await crearEmpresaComercial(c, "0614-150392-101-3");
    await c.query(`update empresas set sistema_inventario = 'analitico' where id = $1`, [an.empresaId]);
    await crearUsuario(c, CONTADOR, 2, an);
    const en = (m: string, r: string, cuerpo?: unknown) => pedir(m, r, CONTADOR, cuerpo, an.empresaId);
    const prov = (
      await en("POST", "/terceros", {
        nombre: "Proveedor",
        nit: "1234-567890-123-0",
        nrc: "123456-7",
        esProveedor: true,
      })
    ).cuerpo["id"] as string;
    const cli = (
      await en("POST", "/terceros", {
        nombre: "Cliente",
        nit: "0000-000000-104-0",
        nrc: "111111-1",
        esCliente: true,
      })
    ).cuerpo["id"] as string;
    const prod = (await en("POST", "/productos", { codigo: "A-1", nombre: "Producto" })).cuerpo[
      "id"
    ] as string;
    const caja = await an.cuenta("110101");
    const compra = await en("POST", "/compras", {
      sucursalId: an.sucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: "C-1",
      fecha: "2026-10-01",
      terceroId: prov,
      condicionPago: "contado",
      cuentaPagoId: caja,
      lineas: [{ productoId: prod, cantidad: 2, precioUnitario: 100 }],
    });
    expect(compra.status, JSON.stringify(compra.cuerpo)).toBe(201);
    expect(await lineas((compra.cuerpo as unknown as DocumentoComercialVista).partidaId)).toEqual([
      ["4101", "200.00", "0.00"],
      ["1112", "26.00", "0.00"],
      ["110101", "0.00", "226.00"],
    ]);
    const v = await en("POST", "/ventas", {
      sucursalId: an.sucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: "V-1",
      fecha: "2026-10-02",
      terceroId: cli,
      condicionPago: "contado",
      cuentaPagoId: caja,
      lineas: [{ productoId: prod, cantidad: 1, precioUnitario: 150 }],
    });
    expect(v.status, JSON.stringify(v.cuerpo)).toBe(201);
    const doc = v.cuerpo as unknown as DocumentoComercialVista;
    expect(doc.partidaCostoId).toBeNull();
    expect(doc.lineas[0]!.costoKardex).toBe("100.00");
  });
});

describe("validaciones", () => {
  it("no registra dos veces el mismo número de venta", async () => {
    const r = await pedir("POST", "/ventas", CONTADOR, venta());
    expect(r.status).toBe(409);
    expect(r.cuerpo["message"]).toMatch(/CCF-0001/);
  });

  it("un CCF necesita un cliente con NRC; el tercero debe ser cliente", async () => {
    const sinCliente = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({ numeroDocumento: "V-1", terceroId: undefined }),
    );
    expect(sinCliente.status).toBe(400);
    const sinNrc = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({ numeroDocumento: "V-2", terceroId: sinNrcId }),
    );
    expect(sinNrc.status).toBe(422);
    expect(sinNrc.cuerpo["message"]).toMatch(/NRC/);
    const proveedor = (
      (await pedir("GET", "/terceros?rol=proveedor", CONTADOR)).cuerpo as unknown as { id: string }[]
    )[0]!.id;
    const noCliente = await pedir(
      "POST",
      "/ventas",
      CONTADOR,
      venta({ numeroDocumento: "V-3", terceroId: proveedor }),
    );
    expect(noCliente.status).toBe(422);
    expect(noCliente.cuerpo["message"]).toMatch(/no es un cliente/);
  });

  it("valida el cuerpo: al crédito sin cliente, rango en un CCF y contado sin caja", async () => {
    expect(
      (
        await pedir(
          "POST",
          "/ventas",
          CONTADOR,
          venta({
            numeroDocumento: "V-4",
            tipoDocumento: "factura",
            terceroId: undefined,
            condicionPago: "credito",
            cuentaPagoId: undefined,
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await pedir(
          "POST",
          "/ventas",
          CONTADOR,
          venta({ numeroDocumento: "V-5", numeroDocumentoHasta: "V-9" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/ventas", CONTADOR, venta({ numeroDocumento: "V-6", cuentaPagoId: undefined })))
        .status,
    ).toBe(400);
  });
});

describe("permisos y alcance", () => {
  it("consulta ve las ventas pero no las registra; quien no es miembro no entra", async () => {
    expect((await pedir("POST", "/ventas", CONSULTA, venta({ numeroDocumento: "P-1" }))).status).toBe(403);
    const lista = (await pedir("GET", "/ventas?busqueda=tecno", CONSULTA))
      .cuerpo as unknown as DocumentoComercialVista[];
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((d) => d.operacion === "venta")).toBe(true);
    expect((await pedir("GET", "/ventas", FORASTERO)).status).toBe(404);
  });

  it("las ventas no aparecen en la lista de compras ni al revés", async () => {
    const compras = (await pedir("GET", "/compras", CONTADOR)).cuerpo as unknown as DocumentoComercialVista[];
    const ventas = (await pedir("GET", "/ventas", CONTADOR)).cuerpo as unknown as DocumentoComercialVista[];
    expect(compras.every((d) => d.operacion === "compra")).toBe(true);
    expect(ventas.every((d) => d.operacion === "venta")).toBe(true);
    const unaVenta = ventas[0]!;
    expect((await pedir("GET", `/compras/${unaVenta.id}`, CONTADOR)).status).toBe(404);
  });
});
