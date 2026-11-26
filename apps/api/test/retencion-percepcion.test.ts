// Retención y percepción del 1 % de IVA reflejadas en los libros y en la liquidación (HU-50, S3-T51). Dos empresas:
// una «otro contribuyente», a la que los grandes contribuyentes retienen y perciben (sufridas: restan del IVA por
// pagar), y una gran contribuyente, que retiene y percibe a los demás (efectuadas: se enteran aparte y no restan).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DocumentoComercialVista,
  LibroCompras,
  LibroContribuyentes,
  LiquidacionIvaVista,
  RetencionPercepcionVista,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONTADOR_GRANDE = "55555555-5555-4555-8555-555555555555";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";

interface Contexto {
  emp: EmpresaComercial;
  usuario: string;
  ingreso: string;
  gasto: string;
  caja: string;
  terceros: number;
}

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let otro: Contexto;
let grande: Contexto;
const documentos = new Map<string, DocumentoComercialVista>();

async function pedir(x: Contexto, metodo: string, ruta: string, cuerpo?: unknown, usuario = x.usuario) {
  const r = await fetch(`${url}/empresas/${x.emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

async function contexto(
  nit: string,
  usuario: string,
  clasificacion: "grande" | "otro",
  prefijo: string,
): Promise<Contexto> {
  const emp = await crearEmpresaComercial(c, nit, clasificacion);
  await crearUsuario(c, usuario, 2, emp);
  await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, '510101', 'Ventas a contribuyentes', 'acreedora', 'ingresos')`,
    [emp.empresaId],
  );
  const gasto = (
    await c.query(
      `select cu.id from cuentas cu where cu.empresa_id = $1 and cu.tipo = 'costos_gastos' and cu.activa
         and not exists (select 1 from cuentas h where h.cuenta_padre_id = cu.id) order by cu.codigo limit 1`,
      [emp.empresaId],
    )
  ).rows[0].id as string;
  return {
    emp,
    usuario,
    ingreso: await emp.cuenta("510101"),
    gasto,
    caja: await emp.cuenta("110101"),
    terceros: Number(prefijo),
  };
}

async function tercero(x: Contexto, nombre: string, clasificacion: "grande" | "mediano" | "otro") {
  x.terceros += 1;
  const n = String(x.terceros).padStart(3, "0");
  return (
    await c.query(
      `insert into terceros (empresa_id, nombre, nit, nrc, es_cliente, es_proveedor, clasificacion)
       values ($1, $2, $3, $4, true, true, $5) returning id`,
      [
        x.emp.empresaId,
        nombre,
        `0614-${n}${x.terceros}-101-${x.terceros % 10}`,
        `${n}${x.terceros}-${x.terceros % 10}`,
        clasificacion,
      ],
    )
  ).rows[0].id as string;
}

async function producto(x: Contexto, codigo: string): Promise<string> {
  const r = await pedir(x, "POST", "/productos", { codigo, nombre: `Producto ${codigo}` });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo["id"] as string;
}

async function registrar(
  x: Contexto,
  operacion: "compras" | "ventas",
  numero: string,
  fecha: string,
  base: string,
  terceroId: string,
  productoId?: string,
) {
  const r = await pedir(x, "POST", `/${operacion}`, {
    sucursalId: x.emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: numero,
    fecha,
    terceroId,
    condicionPago: operacion === "ventas" ? "contado" : "credito",
    ...(operacion === "ventas" ? { cuentaPagoId: x.caja } : {}),
    // Con producto la línea es un bien: la percepción del 1 % solo recae sobre bienes (art. 163 CT)
    lineas: [
      productoId
        ? { productoId, cantidad: 1, precioUnitario: base }
        : {
            cuentaId: operacion === "ventas" ? x.ingreso : x.gasto,
            descripcion: "Operación de prueba",
            cantidad: 1,
            precioUnitario: base,
          },
    ],
  });
  expect(r.status, `${numero} ${JSON.stringify(r.cuerpo)}`).toBe(201);
  const documento = r.cuerpo as unknown as DocumentoComercialVista;
  documentos.set(numero, documento);
  await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documento.partidaId]);
  return documento;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_retencion_percepcion");
  c = await reiniciarBase(urlBase);
  otro = await contexto("0614-010190-101-5", CONTADOR, "otro", "100");
  grande = await contexto("0614-020290-102-6", CONTADOR_GRANDE, "grande", "200");
  await crearUsuario(c, AUXILIAR, 3, otro.emp, [otro.emp.otraSucursalId]);

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

  // Empresa «otro contribuyente»: un proveedor gran contribuyente nos percibe y un cliente gran contribuyente nos retiene
  const proveedorGrande = await tercero(otro, "Proveedor Gran Contribuyente", "grande");
  const clienteGrande = await tercero(otro, "Cliente Gran Contribuyente", "grande");
  const clienteComun = await tercero(otro, "Cliente común", "otro");
  const productoOtro = await producto(otro, "RP-01");
  await registrar(otro, "compras", "CCF-P1", "2026-03-04", "1000.00", proveedorGrande, productoOtro); // percibido 10.00
  await registrar(otro, "compras", "CCF-P2", "2026-03-06", "99.00", proveedorGrande); // bajo el mínimo: sin 1 %
  await registrar(otro, "ventas", "CCF-V1", "2026-03-12", "800.00", clienteGrande); // retenido 8.00
  await registrar(otro, "ventas", "CCF-V2", "2026-03-15", "300.00", clienteComun); // sin 1 %
  await registrar(otro, "ventas", "CCF-V3", "2026-03-20", "500.00", clienteGrande); // retenido 5.00 (se anulará)

  // Empresa gran contribuyente: retiene al proveedor común y percibe al cliente común
  const proveedorComun = await tercero(grande, "Proveedor común", "otro");
  const clienteComunG = await tercero(grande, "Cliente común", "otro");
  // Compra y venta del mismo bien: la venta necesita existencias y la percepción solo recae sobre bienes
  const productoGrande = await producto(grande, "RP-02");
  await registrar(grande, "compras", "CCF-G1", "2026-03-05", "500.00", proveedorComun, productoGrande); // retenido 5.00
  await registrar(grande, "ventas", "CCF-G2", "2026-03-18", "1000.00", clienteComunG, productoGrande); // percibido 10.00
}, 180_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

const retenciones = async (x: Contexto, mes = 3, usuario = x.usuario) => {
  const r = await pedir(x, "GET", `/retencion-percepcion?anio=2026&mes=${mes}`, undefined, usuario);
  return { status: r.status, v: r.cuerpo as unknown as RetencionPercepcionVista };
};
const liquidacion = async (x: Contexto, mes = 3) =>
  (await pedir(x, "GET", `/liquidacion-iva?anio=2026&mes=${mes}`)).cuerpo as unknown as LiquidacionIvaVista;

describe("retención y percepción del 1 % en una empresa que las sufre (HU-50)", () => {
  it("lista los documentos con el 1 %, sufridos, y deja fuera los que no llegan al mínimo", async () => {
    const { status, v } = await retenciones(otro);
    expect(status).toBe(200);
    expect(v.clasificacionEmpresa).toBe("otro");
    expect(v.filas.map((f) => [f.numeroDocumento, f.tipo, f.sentido, f.monto, f.baseGravada])).toEqual([
      ["CCF-P1", "percepcion", "sufrida", "10.00", "1000.00"],
      ["CCF-V1", "retencion", "sufrida", "8.00", "800.00"],
      ["CCF-V3", "retencion", "sufrida", "5.00", "500.00"],
    ]);
    expect(v.totales).toEqual({
      percibidoSufrido: "10.00",
      retenidoSufrido: "13.00",
      percibidoEfectuado: "0.00",
      retenidoEfectuado: "0.00",
    });
  });

  it("se refleja en los libros: percibido en el de compras, retenido en el de ventas a contribuyentes", async () => {
    const q = "desde=2026-03-01&hasta=2026-03-31";
    const compras = (await pedir(otro, "GET", `/libros-iva/compras?${q}`)).cuerpo as unknown as LibroCompras;
    const ventas = (await pedir(otro, "GET", `/libros-iva/contribuyentes?${q}`))
      .cuerpo as unknown as LibroContribuyentes;
    expect(compras.totales.ivaPercibido).toBe("10.00");
    expect(compras.totales.ivaRetenido).toBe("0.00");
    expect(ventas.totales.ivaRetenido).toBe("13.00");
    expect(ventas.totales.ivaPercibido).toBe("0.00");
  });

  it("se refleja en la liquidación: lo percibido y lo retenido restan del IVA por pagar", async () => {
    // Débito: 104.00 + 39.00 + 65.00 = 208.00; crédito: 130.00 + 12.87 = 142.87; sufridas: 10.00 + 13.00
    const v = await liquidacion(otro);
    expect(v).toMatchObject({
      debitoFiscal: "208.00",
      creditoFiscal: "142.87",
      percibidoSufrido: "10.00",
      retenidoSufrido: "13.00",
      ivaPorPagar: "42.13",
      remanenteTotal: "0.00",
      percibidoEfectuado: "0.00",
      retenidoEfectuado: "0.00",
      totalAEnterar: "42.13",
    });
    expect(v.lineasPartida.map((l) => [l.codigo, l.debe, l.haber])).toEqual([
      ["2109", "208.00", "0.00"],
      ["1112", "0.00", "142.87"],
      ["111301", "0.00", "10.00"],
      ["111302", "0.00", "13.00"],
      ["211103", "0.00", "42.13"],
    ]);
  });

  it("un documento con la partida anulada sale del 1 %, del libro y de la liquidación", async () => {
    const venta = documentos.get("CCF-V3")!;
    const anulada = await pedir(otro, "POST", `/partidas/${venta.partidaId}/anular`, {
      motivo: "Documento duplicado",
      fecha: "2026-03-31",
    });
    expect(anulada.status, JSON.stringify(anulada.cuerpo)).toBe(200);
    const { v } = await retenciones(otro);
    const fila = v.filas.find((f) => f.numeroDocumento === "CCF-V3");
    expect(fila).toMatchObject({ anulado: true, monto: "0.00" });
    expect(v.totales.retenidoSufrido).toBe("8.00");
    const l = await liquidacion(otro);
    expect(l.retenidoSufrido).toBe("8.00");
    expect(l.debitoFiscal).toBe("143.00");
  });

  it("solo ve el mes consultado y exige alcance de toda la empresa", async () => {
    expect((await retenciones(otro, 4)).v.filas).toEqual([]);
    expect((await retenciones(otro, 3, AUXILIAR)).status).toBe(403);
    expect((await pedir(otro, "GET", "/retencion-percepcion?anio=2026&mes=0")).status).toBe(400);
  });
});

describe("retención y percepción del 1 % en un gran contribuyente (HU-50)", () => {
  it("las que aplica son efectuadas: se enteran aparte y no restan del IVA por pagar", async () => {
    const { v } = await retenciones(grande);
    expect(v.clasificacionEmpresa).toBe("grande");
    expect(v.filas.map((f) => [f.numeroDocumento, f.tipo, f.sentido, f.monto])).toEqual([
      ["CCF-G1", "retencion", "efectuada", "5.00"],
      ["CCF-G2", "percepcion", "efectuada", "10.00"],
    ]);
    const l = await liquidacion(grande);
    expect(l).toMatchObject({
      debitoFiscal: "130.00",
      creditoFiscal: "65.00",
      percibidoSufrido: "0.00",
      retenidoSufrido: "0.00",
      ivaPorPagar: "65.00",
      percibidoEfectuado: "10.00",
      retenidoEfectuado: "5.00",
      totalAEnterar: "80.00",
    });
  });
});
