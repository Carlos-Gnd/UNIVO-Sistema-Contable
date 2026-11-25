// Liquidación del IVA (F-07) contra la de CheroPhonex de octubre (HU-48, S3-T45): se registran por la API las once
// compras, los ocho CCF y los cuatro resúmenes de consumidor final de las hojas 5, 6 y 7, y la liquidación debe dar
// débito fiscal US$ 5,986.67 menos crédito fiscal US$ 5,343.00 = US$ 643.67 por pagar. Además: la partida cuadra y
// salda las cuentas, el remanente pasa solo al mes siguiente, la percepción sufrida resta y lo anulado no cuenta.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  DocumentoComercialVista,
  LibroCompras,
  LibroConsumidor,
  LibroContribuyentes,
  LiquidacionIvaVista,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";
import { COMPRAS_CHEROPHONEX, RESUMENES_CHEROPHONEX, VENTAS_CCF_CHEROPHONEX } from "./datos-iva-cherophonex";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let ingreso: string;
let gasto: string;
let caja: string;
let terceroN = 0;
const documentos = new Map<string, DocumentoComercialVista>();

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${emp.empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}
const liquidacion = async (anio: number, mes: number, usuario = CONTADOR) => {
  const r = await pedir("GET", `/liquidacion-iva?anio=${anio}&mes=${mes}`, undefined, usuario);
  return { status: r.status, v: r.cuerpo as unknown as LiquidacionIvaVista };
};
const generar = (anio: number, mes: number, usuario = CONTADOR) =>
  pedir("POST", "/liquidacion-iva/partida", { anio, mes }, usuario);
const contabilizar = (numero: string) =>
  c.query(`update partidas set estado = 'contabilizada' where id = $1`, [documentos.get(numero)!.partidaId]);

async function tercero(nombre: string, nrc: string, clase: "cliente" | "proveedor", grande = false) {
  terceroN += 1;
  const n = String(terceroN).padStart(2, "0");
  return (
    await c.query(
      `insert into terceros (empresa_id, nombre, nit, nrc, es_cliente, es_proveedor, clasificacion)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        emp.empresaId,
        nombre,
        `0614-0303${n}-101-${terceroN % 10}`,
        nrc,
        clase === "cliente",
        clase === "proveedor",
        grande ? "grande" : "otro",
      ],
    )
  ).rows[0].id as string;
}

async function registrar(
  operacion: "compras" | "ventas",
  numero: string,
  fecha: string,
  base: string,
  terceroId: string,
) {
  const r = await pedir("POST", `/${operacion}`, {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: numero,
    fecha,
    terceroId,
    condicionPago: operacion === "ventas" ? "contado" : "credito",
    ...(operacion === "ventas" ? { cuentaPagoId: caja } : {}),
    lineas: [
      {
        cuentaId: operacion === "ventas" ? ingreso : gasto,
        descripcion: "Operación de prueba",
        cantidad: 1,
        precioUnitario: base,
      },
    ],
  });
  expect(r.status, `${numero} ${JSON.stringify(r.cuerpo)}`).toBe(201);
  documentos.set(numero, r.cuerpo as unknown as DocumentoComercialVista);
  await contabilizar(numero);
}

/** Saldo (debe menos haber) de una cuenta en partidas contabilizadas. */
async function saldo(codigo: string): Promise<string> {
  const r = await c.query(
    `select coalesce(sum(d.debe - d.haber), 0)::text as s from partida_detalles d
       join partidas p on p.id = d.partida_id join cuentas cu on cu.id = d.cuenta_id
      where p.empresa_id = $1 and p.estado = 'contabilizada' and cu.codigo = $2`,
    [emp.empresaId, codigo],
  );
  return r.rows[0].s as string;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_liquidacion_iva");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, AUXILIAR, 3, emp, [emp.otraSucursalId]);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.otraSucursalId]);

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
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values
       ($1, '510101', 'Ventas a contribuyentes', 'acreedora', 'ingresos'),
       ($1, '510102', 'Ventas a consumidor final', 'acreedora', 'ingresos')`,
    [emp.empresaId],
  );
  ingreso = await emp.cuenta("510101");
  caja = await emp.cuenta("110101");
  gasto = (
    await c.query(
      `select cu.id from cuentas cu where cu.empresa_id = $1 and cu.tipo = 'costos_gastos' and cu.activa
         and not exists (select 1 from cuentas h where h.cuenta_padre_id = cu.id) order by cu.codigo limit 1`,
      [emp.empresaId],
    )
  ).rows[0].id as string;

  // Octubre de CheroPhonex: compras, CCF y resúmenes de consumidor final, todo contabilizado
  const proveedores = new Map<string, string>();
  for (const [fecha, tipo, numero, nrc, proveedor, concepto, clase, base] of COMPRAS_CHEROPHONEX) {
    let terceroId = proveedores.get(proveedor);
    if (!terceroId) {
      terceroId = await tercero(proveedor, nrc ?? `9${String(terceroN + 1).padStart(5, "0")}-0`, "proveedor");
      proveedores.set(proveedor, terceroId);
    }
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
    await contabilizar(numero);
  }
  const clientes = new Map<string, string>();
  for (const [fecha, numero, nrc, cliente, gravado] of VENTAS_CCF_CHEROPHONEX) {
    let terceroId = clientes.get(nrc);
    if (!terceroId) {
      terceroId = await tercero(cliente, nrc, "cliente");
      clientes.set(nrc, terceroId);
    }
    await registrar("ventas", numero, fecha, gravado, terceroId);
  }
  const consumidor = await c.query(`select id from cuentas where empresa_id = $1 and codigo = '510102'`, [
    emp.empresaId,
  ]);
  for (const [fecha, del, al, , , total] of RESUMENES_CHEROPHONEX) {
    const r = await pedir("POST", "/ventas", {
      sucursalId: emp.sucursalId,
      tipoDocumento: "factura",
      numeroDocumento: del,
      numeroDocumentoHasta: al,
      fecha,
      condicionPago: "contado",
      cuentaPagoId: caja,
      lineas: [
        {
          cuentaId: consumidor.rows[0].id,
          descripcion: "Facturas de consumidor final",
          cantidad: 1,
          precioUnitario: total,
        },
      ],
    });
    expect(r.status, `${del} ${JSON.stringify(r.cuerpo)}`).toBe(201);
    documentos.set(del, r.cuerpo as unknown as DocumentoComercialVista);
    await contabilizar(del);
  }
}, 180_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("liquidación del IVA de CheroPhonex, octubre (HU-48)", () => {
  it("débito 5,986.67 menos crédito 5,343.00 da 643.67 por pagar y coincide con los libros de IVA", async () => {
    const { status, v } = await liquidacion(2026, 10);
    expect(status).toBe(200);
    expect(v).toMatchObject({
      debitoContribuyentes: "3331.00",
      debitoConsumidorFinal: "2655.67",
      debitoFiscal: "5986.67",
      creditoFiscal: "5343.00",
      percibidoSufrido: "0.00",
      retenidoSufrido: "0.00",
      remanenteAnteriorTotal: "0.00",
      ivaPorPagar: "643.67",
      remanenteTotal: "0.00",
      totalAEnterar: "643.67",
      fechaPartida: "2026-10-31",
      declaracion: null,
      periodoAbierto: true,
    });

    // Los mismos totales que muestran los tres libros del período
    const q = "desde=2026-10-01&hasta=2026-10-31";
    const compras = (await pedir("GET", `/libros-iva/compras?${q}`)).cuerpo as unknown as LibroCompras;
    const ccf = (await pedir("GET", `/libros-iva/contribuyentes?${q}`))
      .cuerpo as unknown as LibroContribuyentes;
    const cf = (await pedir("GET", `/libros-iva/consumidor-final?${q}`)).cuerpo as unknown as LibroConsumidor;
    expect(v.creditoFiscal).toBe(compras.totales.creditoFiscal);
    expect(v.debitoContribuyentes).toBe(ccf.totales.debitoFiscal);
    expect(v.debitoConsumidorFinal).toBe(cf.totales.ivaIncluido);
  });

  it("la vista previa de la partida cierra el débito fiscal contra el crédito y deja el IVA por pagar", async () => {
    const { v } = await liquidacion(2026, 10);
    expect(v.lineasPartida).toEqual([
      { codigo: "2109", nombre: expect.any(String), debe: "5986.67", haber: "0.00" },
      { codigo: "1112", nombre: expect.any(String), debe: "0.00", haber: "5343.00" },
      { codigo: "211103", nombre: expect.any(String), debe: "0.00", haber: "643.67" },
    ]);
  });

  it("un usuario con una sola sucursal (consulta o auxiliar) no ve ni genera la liquidación de toda la empresa", async () => {
    expect((await liquidacion(2026, 10, CONSULTA)).status).toBe(403);
    expect((await generar(2026, 10, CONSULTA)).status).toBe(403);
    expect((await liquidacion(2026, 10, AUXILIAR)).status).toBe(403);
    expect((await pedir("GET", "/liquidacion-iva?anio=2026&mes=13")).status).toBe(400);
  });

  it("genera la partida en borrador, cuadrada, y no deja generar otra del mismo mes", async () => {
    const r = await generar(2026, 10);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    const v = r.cuerpo as unknown as LiquidacionIvaVista;
    expect(v.declaracion).toMatchObject({
      estadoPartida: "borrador",
      debitoFiscal: "5986.67",
      ivaPorPagar: "643.67",
      remanenteTotal: "0.00",
      presentadaEn: null,
      desactualizada: false,
    });
    const partida = await c.query(
      `select p.estado::text, p.origen, p.tipo::text, to_char(p.fecha, 'YYYY-MM-DD') as fecha,
              sum(d.debe)::text as debe, sum(d.haber)::text as haber
         from partidas p join partida_detalles d on d.partida_id = p.id where p.id = $1 group by p.id`,
      [v.declaracion!.partidaId],
    );
    expect(partida.rows[0]).toMatchObject({
      estado: "borrador",
      origen: "liquidacion_iva",
      tipo: "ajuste",
      fecha: "2026-10-31",
      debe: "5986.67",
      haber: "5986.67",
    });
    expect((await generar(2026, 10)).status).toBe(409);
  });

  it("contabilizada la partida, el débito y el crédito fiscal quedan saldados y el IVA por pagar en 211103", async () => {
    const { v } = await liquidacion(2026, 10);
    expect((await pedir("POST", "/liquidacion-iva/presentar", { anio: 2026, mes: 10 })).status).toBe(422);
    await c.query(`update partidas set estado = 'contabilizada' where id = $1`, [v.declaracion!.partidaId]);
    expect(await saldo("2109")).toBe("0.00");
    expect(await saldo("1112")).toBe("0.00");
    expect(await saldo("211103")).toBe("-643.67");

    const presentada = await pedir("POST", "/liquidacion-iva/presentar", { anio: 2026, mes: 10 });
    expect(presentada.status).toBe(201);
    expect((presentada.cuerpo as unknown as LiquidacionIvaVista).declaracion?.presentadaEn).not.toBeNull();
    expect((await generar(2026, 10)).status).toBe(409);
  });
});

describe("remanente y retenciones sufridas (HU-48)", () => {
  it("el crédito que supera al débito se traslada al mes siguiente y se aplica solo", async () => {
    const proveedor = await tercero("Proveedor de noviembre", "400100-1", "proveedor");
    const cliente = await tercero("Cliente de noviembre", "400200-2", "cliente");
    await registrar("compras", "CCF-N001", "2026-11-05", "1000.00", proveedor); // crédito 130.00
    await registrar("ventas", "CCF-N002", "2026-11-12", "100.00", cliente); // débito 13.00
    const nov = (await liquidacion(2026, 11)).v;
    expect(nov).toMatchObject({
      debitoFiscal: "13.00",
      creditoFiscal: "130.00",
      ivaPorPagar: "0.00",
      remanenteTotal: "117.00",
      remanente: { credito: "117.00", percibido: "0.00", retenido: "0.00" },
    });
    // El crédito de octubre estaba agotado: lo único que se traslada es el de noviembre
    expect(nov.remanenteAnteriorTotal).toBe("0.00");
    expect(nov.lineasPartida.map((l) => [l.codigo, l.debe, l.haber])).toEqual([
      ["2109", "13.00", "0.00"],
      ["1112", "0.00", "13.00"],
    ]);

    await registrar("ventas", "CCF-D001", "2026-12-03", "500.00", cliente); // débito 65.00
    const dic = (await liquidacion(2026, 12)).v;
    expect(dic).toMatchObject({
      debitoFiscal: "65.00",
      creditoFiscal: "0.00",
      remanenteAnteriorTotal: "117.00",
      ivaPorPagar: "0.00",
      remanenteTotal: "52.00",
    });
    // Un mes sin documentos conserva el remanente, incluso al cambiar de año
    const ene = (await liquidacion(2027, 1)).v;
    expect(ene).toMatchObject({
      debitoFiscal: "0.00",
      remanenteAnteriorTotal: "52.00",
      remanenteTotal: "52.00",
    });
    expect((await generar(2027, 1)).status).toBe(422);
  });

  it("la percepción que nos cobra un gran contribuyente resta del IVA por pagar", async () => {
    const grande = await tercero("Proveedor gran contribuyente", "500100-3", "proveedor", true);
    const cliente = await tercero("Cliente de marzo", "500200-4", "cliente");
    await registrar("compras", "CCF-G001", "2026-03-04", "1000.00", grande); // crédito 130.00, percibido 10.00
    await registrar("ventas", "CCF-G002", "2026-03-18", "800.00", cliente); // débito 104.00
    const mar = (await liquidacion(2026, 3)).v;
    expect(mar).toMatchObject({
      debitoFiscal: "104.00",
      creditoFiscal: "130.00",
      percibidoSufrido: "10.00",
      ivaPorPagar: "0.00",
      remanente: { credito: "26.00", percibido: "10.00", retenido: "0.00" },
    });
    await registrar("ventas", "CCF-G003", "2026-04-10", "400.00", cliente); // débito 52.00
    const abr = (await liquidacion(2026, 4)).v;
    expect(abr).toMatchObject({
      debitoFiscal: "52.00",
      remanenteAnteriorTotal: "36.00",
      ivaPorPagar: "16.00",
      remanenteTotal: "0.00",
    });
    expect(abr.lineasPartida.map((l) => [l.codigo, l.debe, l.haber])).toEqual([
      ["2109", "52.00", "0.00"],
      ["1112", "0.00", "26.00"],
      ["111301", "0.00", "10.00"],
      ["211103", "0.00", "16.00"],
    ]);
  });

  it("un documento con la partida anulada deja de contar y avisa que la liquidación quedó desactualizada", async () => {
    const antes = (await liquidacion(2026, 3)).v;
    const generada = await generar(2026, 3);
    expect(generada.status, JSON.stringify(generada.cuerpo)).toBe(201);
    const venta = documentos.get("CCF-G002")!;
    const anulada = await pedir("POST", `/partidas/${venta.partidaId}/anular`, {
      motivo: "Documento duplicado",
      fecha: "2026-03-31",
    });
    expect(anulada.status, JSON.stringify(anulada.cuerpo)).toBe(200);
    const despues = (await liquidacion(2026, 3)).v;
    expect(antes.debitoFiscal).toBe("104.00");
    expect(despues.debitoFiscal).toBe("0.00");
    expect(despues.declaracion?.desactualizada).toBe(true);
  });
});
