// Antigüedad de saldos (HU-63, S3-T73 y S3-T75): los tramos suman el saldo total y cuadran con el mayor.
// Usa una base propia (contable_api_antiguedad) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AbonoVista,
  AntiguedadSaldos,
  DocumentoComercialVista,
  NotaComercialVista,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import { crearEmpresaComercial, crearUsuario, type EmpresaComercial } from "./ayudas-comercial";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let emp: EmpresaComercial;
let ajena: EmpresaComercial;
let cliente1: string;
let cliente2: string;
let proveedor: string;
let cuentaIngreso: string;
let cuentaGasto: string;
let caja: string;
let serie = 0;
const docs: Record<string, DocumentoComercialVista> = {};

async function pedir(
  metodo: string,
  ruta: string,
  usuario: string,
  cuerpo?: unknown,
  empresa = emp.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresa}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const crear = async <T>(ruta: string, cuerpo: Record<string, unknown>) => {
  const r = await pedir("POST", ruta, CONTADOR, cuerpo);
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo as unknown as T;
};

const venta = (
  clave: string,
  fecha: string,
  precio: number,
  extra: Record<string, unknown> = {},
  tercero = cliente1,
) =>
  crear<DocumentoComercialVista>("/ventas", {
    sucursalId: emp.sucursalId,
    tipoDocumento: "ccf",
    numeroDocumento: `V-${++serie}`,
    fecha,
    terceroId: tercero,
    condicionPago: "credito",
    diasCredito: 30,
    lineas: [{ cuentaId: cuentaIngreso, cantidad: 1, precioUnitario: precio }],
    ...extra,
  }).then((d) => (docs[clave] = d));

const consultar = async (operacion: "venta" | "compra", alFecha: string, extra = "") => {
  const r = await pedir(
    "GET",
    `/antiguedad-saldos?operacion=${operacion}&alFecha=${alFecha}${extra}`,
    CONSULTA,
  );
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return r.cuerpo as unknown as AntiguedadSaldos;
};

const contabilizar = (...partidas: string[]) =>
  c.query(`update partidas set estado = 'contabilizada' where id = any($1::uuid[])`, [partidas]);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_antiguedad");
  c = await reiniciarBase(urlBase);
  emp = await crearEmpresaComercial(c, "0614-010190-101-5");
  ajena = await crearEmpresaComercial(c, "0614-150390-101-8");
  await crearUsuario(c, CONTADOR, 2, emp);
  await crearUsuario(c, CONSULTA, 4, emp, [emp.sucursalId]);
  await crearUsuario(c, FORASTERO, 2, ajena);
  cuentaIngreso = await emp.cuenta("5101");
  cuentaGasto = await emp.cuenta("4201");
  caja = await emp.cuenta("110101");

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
  cliente1 = await tercero({
    nombre: "Tecno Plaza",
    nit: "1234-567890-123-0",
    nrc: "245871-4",
    esCliente: true,
  });
  cliente2 = await tercero({
    nombre: "Zeta Cómputo",
    nit: "1000-000000-009-0",
    nrc: "333333-3",
    esCliente: true,
  });
  proveedor = await tercero({
    nombre: "Totalynk",
    nit: "0000-000000-104-0",
    nrc: "123456-7",
    esProveedor: true,
  });

  await venta("v1", "2026-06-01", 1000); // vence 2026-07-01
  await venta("v2", "2026-08-15", 500); // vence 2026-09-14
  await venta("v3", "2026-09-20", 200); // vence 2026-10-20
  await venta("v4", "2026-10-15", 100); // vence 2026-11-14
  await venta("v5", "2026-10-05", 300, {
    condicionPago: "contado",
    cuentaPagoId: caja,
    diasCredito: undefined,
  });
  await venta("v6", "2026-09-01", 300, { diasCredito: 60 }, cliente2); // vence 2026-10-31
}, 90_000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("antigüedad de saldos de clientes", () => {
  it("con todo en borrador el reporte está vacío y cuadra con un mayor sin movimientos", async () => {
    const r = await consultar("venta", "2026-10-31");
    expect(r.filas).toEqual([]);
    expect(r.totales.total).toBe("0.00");
    expect(r.cuadre).toMatchObject({ saldoMayor: "0.00", cuadra: true });
  });

  it("reparte los saldos por cliente y tramo con las partidas contabilizadas", async () => {
    await contabilizar(...Object.values(docs).map((d) => d.partidaId));
    const r = await consultar("venta", "2026-10-31");
    expect(r.filas.map((f) => f.tercero.nombre)).toEqual(["Tecno Plaza", "Zeta Cómputo"]);
    expect(r.filas[0]).toMatchObject({
      total: "2034.00",
      tramos: { corriente: "113.00", d1_30: "226.00", d31_60: "565.00", d61_90: "0.00", mas_90: "1130.00" },
    });
    expect(r.filas[1]).toMatchObject({ total: "339.00", tramos: { corriente: "339.00" } });
    expect(r.totales).toEqual({
      corriente: "452.00",
      d1_30: "226.00",
      d31_60: "565.00",
      d61_90: "0.00",
      mas_90: "1130.00",
      total: "2373.00",
    });
    expect(r.filas[0]!.documentos.map((d) => [d.numeroDocumento, d.diasVencido, d.tramo])).toEqual([
      [docs["v1"]!.numeroDocumento, 122, "mas_90"],
      [docs["v2"]!.numeroDocumento, 47, "d31_60"],
      [docs["v3"]!.numeroDocumento, 11, "d1_30"],
      [docs["v4"]!.numeroDocumento, -14, "corriente"],
    ]);
    // la venta al contado no genera saldo y el total cuadra con cuentas por cobrar (1103) del mayor
    expect(r.cuadre).toEqual({
      cuenta: "1103",
      saldoMayor: "2373.00",
      saldoReporte: "2373.00",
      diferencia: "0.00",
      cuadra: true,
    });
  });

  it("los tramos de cada fila y del total suman el saldo total", async () => {
    const r = await consultar("venta", "2026-10-31");
    const suma = (t: Record<string, string>) =>
      (["corriente", "d1_30", "d31_60", "d61_90", "mas_90"] as const).reduce(
        (s, k) => s + Math.round(Number(t[k]) * 100),
        0,
      ) / 100;
    for (const f of r.filas) expect(suma(f.tramos).toFixed(2)).toBe(f.total);
    expect(suma(r.totales).toFixed(2)).toBe(r.totales.total);
    expect(r.filas.reduce((s, f) => s + Math.round(Number(f.total) * 100), 0) / 100).toBe(
      Number(r.totales.total),
    );
  });

  it("los abonos y notas contabilizados bajan el saldo; los borradores no cuentan", async () => {
    const abono = await crear<AbonoVista>("/abonos", {
      operacion: "venta",
      sucursalId: emp.sucursalId,
      terceroId: cliente1,
      fecha: "2026-10-10",
      cuentaPagoId: caja,
      aplicaciones: [{ documentoId: docs["v1"]!.id, monto: "130.00" }],
    });
    const nota = await crear<NotaComercialVista>("/notas-comerciales", {
      documentoId: docs["v3"]!.id,
      tipo: "credito",
      motivo: "rebaja",
      numeroNota: "NC-1",
      fecha: "2026-10-12",
      lineas: [{ lineaOrden: 1, monto: 100 }],
    });
    // en borrador no se ven en el reporte
    let r = await consultar("venta", "2026-10-31");
    expect(r.totales.total).toBe("2373.00");
    expect(r.cuadre.cuadra).toBe(true);
    await contabilizar(abono.partidaId, nota.partidaId);
    r = await consultar("venta", "2026-10-31");
    expect(r.filas[0]!.tramos).toMatchObject({ mas_90: "1000.00", d1_30: "113.00" });
    expect(r.totales.total).toBe("2130.00");
    expect(r.cuadre).toMatchObject({ saldoMayor: "2130.00", diferencia: "0.00", cuadra: true });
  });

  it("a una fecha de corte anterior no cuenta lo posterior y sigue cuadrando", async () => {
    const r = await consultar("venta", "2026-10-05");
    // ya existían v1, v2, v3 y v6; los abonos y notas son posteriores y v4 aún no se emitía
    expect(r.totales.total).toBe("2260.00");
    expect(r.filas[0]!.documentos).toHaveLength(3);
    expect(r.cuadre).toMatchObject({ saldoMayor: "2260.00", cuadra: true });
  });

  it("un movimiento manual en cuentas por cobrar descuadra y el reporte lo avisa", async () => {
    const cxc = await c.query(
      `select id from cuentas where empresa_id = $1 and codigo like '1103%' and not exists (select 1 from cuentas h where h.cuenta_padre_id = cuentas.id) order by codigo limit 1`,
      [emp.empresaId],
    );
    const p = (
      await c.query(
        `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto) values ($1, $2, '2026-10-20', 'operacion', 'Saldo manual') returning id`,
        [emp.empresaId, emp.sucursalId],
      )
    ).rows[0].id as string;
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden) values ($1, $2, 50, 0, 0), ($1, $3, 0, 50, 1)`,
      [p, cxc.rows[0].id, caja],
    );
    await contabilizar(p);
    const r = await consultar("venta", "2026-10-31");
    expect(r.cuadre).toMatchObject({
      saldoMayor: "2180.00",
      saldoReporte: "2130.00",
      diferencia: "50.00",
      cuadra: false,
    });
  });

  it("filtra por cliente y respeta la empresa y el permiso", async () => {
    const uno = await consultar("venta", "2026-10-31", `&terceroId=${cliente2}`);
    expect(uno.filas).toHaveLength(1);
    expect(uno.totales.total).toBe("339.00");
    expect((await pedir("GET", `/antiguedad-saldos?operacion=venta`, FORASTERO)).status).toBe(404);
    expect(
      (await pedir("GET", `/antiguedad-saldos?operacion=venta`, FORASTERO, undefined, ajena.empresaId))
        .status,
    ).toBe(200);
    expect((await pedir("GET", `/antiguedad-saldos`, CONSULTA)).status).toBe(400);
  });
});

describe("antigüedad de saldos de proveedores", () => {
  it("agrupa lo que se debe por proveedor y cuadra con cuentas por pagar (2102)", async () => {
    const compra = await crear<DocumentoComercialVista>("/compras", {
      sucursalId: emp.sucursalId,
      tipoDocumento: "ccf",
      numeroDocumento: "P-1",
      fecha: "2026-08-01",
      terceroId: proveedor,
      condicionPago: "credito",
      diasCredito: 30,
      lineas: [{ cuentaId: cuentaGasto, cantidad: 1, precioUnitario: 1000 }],
    });
    await contabilizar(compra.partidaId);
    const r = await consultar("compra", "2026-10-31");
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      tercero: { nombre: "Totalynk" },
      total: "1130.00",
      tramos: { d61_90: "1130.00" },
    });
    expect(r.cuadre).toMatchObject({ cuenta: "2102", saldoMayor: "1130.00", cuadra: true });
    const pago = await crear<AbonoVista>("/abonos", {
      operacion: "compra",
      sucursalId: emp.sucursalId,
      terceroId: proveedor,
      fecha: "2026-10-15",
      cuentaPagoId: caja,
      aplicaciones: [{ documentoId: compra.id, monto: "130.00" }],
    });
    await contabilizar(pago.partidaId);
    const despues = await consultar("compra", "2026-10-31");
    expect(despues.totales.total).toBe("1000.00");
    expect(despues.cuadre.cuadra).toBe(true);
  });
});
