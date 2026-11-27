// Razones financieras de CheroPhonex (HU-84, S4-T24): lo que devuelve el endpoint debe coincidir con el
// cálculo manual hecho desde los estados del caso (octubre de 2026, 44 partidas).
//
// Los insumos salen del ejercicio, no del sistema (estado de resultados y balance general al 31-oct):
//
//   Estado de resultados de octubre            Balance general al 31-oct (posterior al cierre)
//   ventas netas ............... 46,051.20     activo corriente ........... 29,564.79
//   costo de ventas ............ 34,112.00       efectivo y bancos (110101 + 110102 + 11010301) 200.00 + 22,070.89
//   utilidad bruta ............. 11,939.20       otras cuentas corrientes (110803 + 111104)    600.00 + 805.90
//   gastos de administración ..  1,864.17       inventario (1109) ....... 5,888.00
//   gastos de venta ............  2,465.04     activo no corriente ........  2,395.83 (2,500.00 − 104.17 depreciación)
//   utilidad de operación ...... 7,609.99 (*)  total activo ............... 31,960.62
//   gastos financieros ......... 15.00 (costos financieros)  pasivo corriente ...........  2,315.63 (todo el pasivo del caso)
//   utilidad neta .............. 7,594.99     patrimonio ................. 29,644.99 (capital 22,500.00 + 7,144.99)
//
// (*) Criterio del sistema: en el estado de resultados los costos financieros (4203, US$ 15.00) se clasifican
// como costos financieros (renglón propio), después de la utilidad de operación: 11,939.20 − 1,864.17 − 2,465.04 = 7,609.99, y el
// margen operativo es 7,609.99 / 46,051.20 × 100 = 16.53 %. El criterio anterior (financieros como gasto de
// operación) daba una utilidad de operación de 7,594.99 y un margen de 16.49 %, igual al neto.
//
// Cálculo manual de cada razón (se redondea a 2 decimales, mitad hacia arriba):
//   liquidez corriente  = activo corriente / pasivo corriente         = 29,564.79 / 2,315.63            = 12.77
//   prueba ácida        = (activo corriente − inventario) / pasivo    = (29,564.79 − 5,888.00) / 2,315.63
//                                                                      = 23,676.79 / 2,315.63            = 10.22
//   endeudamiento (%)   = pasivo total / activo total × 100           = 2,315.63 / 31,960.62 × 100      =  7.25
//   margen bruto (%)    = utilidad bruta / ventas × 100               = 11,939.20 / 46,051.20 × 100     = 25.93
//   margen operativo (%)= utilidad de operación / ventas × 100        = 7,609.99 / 46,051.20 × 100      = 16.53 (*)
//   margen neto (%)     = utilidad neta / ventas × 100                = 7,594.99 / 46,051.20 × 100      = 16.49
//   ROA (%)             = utilidad neta / activo total × 100          = 7,594.99 / 31,960.62 × 100      = 23.76
//   ROE (%)             = utilidad neta / patrimonio × 100            = 7,594.99 / 29,644.99 × 100      = 25.62
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type RazonesFinancieras } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // limitado a una sucursal sin movimientos
const SIN_PERMISO = "33333333-3333-4333-8333-333333333333"; // rol al que se le quita estados.ver
const AJENO = "44444444-4444-4444-8444-444444444444";

const esperado = leerCaso().esperado;
const monto = (valor: string) => Dinero.de(valor).aTexto();

/** Cifras de partida del cálculo manual (ver el encabezado). */
const manual = {
  ventas: "46051.20",
  utilidadBruta: "11939.20",
  /** Bruta − administración − venta; los financieros (4203) van después, en el renglón de costos financieros. */
  utilidadOperacion: "7609.99",
  /** Criterio anterior: con los financieros dentro de los gastos de operación. */
  utilidadOperacionAnterior: "7594.99",
  utilidadNeta: "7594.99",
  activoCorriente: "29564.79",
  inventario: "5888.00",
  pasivoCorriente: "2315.63",
  totalPasivo: "2315.63",
  totalActivo: "31960.62",
  patrimonio: "29644.99",
};

/**
 * Margen operativo manual: 7,609.99 / 46,051.20 × 100 = 16.53 %. En el estado de resultados del sistema los
 * costos financieros (4203, US$ 15.00) se clasifican como costos financieros (renglón propio), fuera de los gastos de operación.
 * Criterio anterior (financieros como gasto de operación): utilidad de operación 7,594.99 y 16.49 %, igual
 * al margen neto; ya no es el del sistema.
 */
const MARGEN_OPERATIVO_MANUAL = "16.53";
/** Margen operativo con el criterio anterior; solo documenta el cálculo, no se compara con la API. */
const MARGEN_OPERATIVO_ANTERIOR = "16.49";

/** Razones calculadas a mano con una calculadora y redondeadas a 2 decimales (sin el margen operativo). */
const razonesManuales = {
  liquidezCorriente: "12.77",
  pruebaAcida: "10.22",
  endeudamiento: "7.25",
  margenBruto: "25.93",
  margenNeto: "16.49",
  rentabilidadActivo: "23.76",
  rentabilidadPatrimonio: "25.62",
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;

async function pedir(query: string, usuario = CONTADOR, empresaId?: string) {
  const r = await fetch(
    `${url}/empresas/${empresaId ?? carga.empresaId}/estados/razones-financieras?${query}`,
    {
      headers: { authorization: `Bearer ${usuario}` },
    },
  );
  return { status: r.status, cuerpo: (await r.json()) as RazonesFinancieras };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_razones_cherophonex");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  const s = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S002') returning id`,
    [carga.empresaId],
  );
  sucursalNueva = s.rows[0]!.id;

  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [SIN_PERMISO, "Sin permiso"],
    [AJENO, "Ajeno"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase().replace(" ", "-")}@prueba.sv`,
    ]);
  }
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );
  const m = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
    [AUXILIAR, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    m.rows[0]!.id,
    sucursalNueva,
  ]);
  // El rol de solo consulta (4) pierde estados.ver únicamente en esta base de pruebas descartable.
  await c.query(
    "delete from rol_permisos where rol_id = 4 and permiso_id = (select id from permisos where modulo = 'estados' and accion = 'ver')",
  );
  const consulta = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 4, false) returning id",
    [SIN_PERMISO, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    consulta.rows[0]!.id,
    carga.sucursalId,
  ]);

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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("las cifras de partida del cálculo manual son las del ejercicio", () => {
  const e = esperado.estadoDeResultados;
  const bg = esperado.balanceGeneral;

  it("ventas, utilidad bruta, utilidad de operación y utilidad neta", () => {
    expect(monto(manual.ventas)).toBe(monto(e.ventasNetas));
    expect(monto(manual.utilidadBruta)).toBe(monto(e.utilidadBruta));
    // criterio del sistema: utilidad de operación = bruta − administración − venta (sin financieros)
    expect(Dinero.de(e.utilidadBruta).menos(e.gastosAdministracion).menos(e.gastosVenta).aTexto()).toBe(
      manual.utilidadOperacion,
    );
    // la utilidad neta se obtiene restando los financieros (4203), que van en costos financieros (renglón propio)
    expect(Dinero.de(manual.utilidadOperacion).menos(e.gastosFinancieros).aTexto()).toBe(
      monto(e.utilidadNeta),
    );
    // criterio anterior: con los financieros dentro de la operación se llegaba a 7,594.99 y a 16.49 %
    const operacionAnterior = Dinero.de(e.utilidadBruta)
      .menos(e.gastosAdministracion)
      .menos(e.gastosVenta)
      .menos(e.gastosFinancieros);
    expect(operacionAnterior.aTexto()).toBe(manual.utilidadOperacionAnterior);
    expect(operacionAnterior.por(100).dividido(e.ventasNetas).aTexto()).toBe(MARGEN_OPERATIVO_ANTERIOR);
    expect(MARGEN_OPERATIVO_ANTERIOR).not.toBe(MARGEN_OPERATIVO_MANUAL);
    expect(monto(manual.utilidadNeta)).toBe(monto(e.utilidadNeta));
  });

  it("activo, pasivo y patrimonio; el activo corriente más el no corriente da el activo total", () => {
    expect(monto(manual.totalActivo)).toBe(monto(bg.totalActivo));
    expect(monto(manual.totalPasivo)).toBe(monto(bg.totalPasivo));
    expect(monto(manual.pasivoCorriente)).toBe(monto(bg.totalPasivo));
    expect(monto(manual.patrimonio)).toBe(monto(bg.totalPatrimonio));
    expect(Dinero.de(manual.activoCorriente).mas("2395.83").aTexto()).toBe(monto(bg.totalActivo));
  });
});

describe("razones de octubre de 2026, consolidado", () => {
  let r: RazonesFinancieras;
  beforeAll(async () => {
    const respuesta = await pedir("desde=2026-10-01&hasta=2026-10-31");
    expect(respuesta.status).toBe(200);
    r = respuesta.cuerpo;
  });

  it("devuelve el período pedido y sin sucursal (consolidado)", () => {
    expect([r.desde, r.hasta, r.sucursalId]).toEqual(["2026-10-01", "2026-10-31", null]);
  });

  it("liquidez corriente: 29,564.79 / 2,315.63 = 12.77", () => {
    expect(r.liquidezCorriente).toBe(razonesManuales.liquidezCorriente);
  });

  it("prueba ácida: (29,564.79 − 5,888.00) / 2,315.63 = 10.22", () => {
    expect(r.pruebaAcida).toBe(razonesManuales.pruebaAcida);
  });

  it("endeudamiento: 2,315.63 / 31,960.62 × 100 = 7.25 %", () => {
    expect(r.endeudamiento).toBe(razonesManuales.endeudamiento);
  });

  it("margen bruto: 11,939.20 / 46,051.20 × 100 = 25.93 %", () => {
    expect(r.margenBruto).toBe(razonesManuales.margenBruto);
  });

  it("margen operativo: 7,609.99 / 46,051.20 × 100 = 16.53 % (costos financieros en renglón propio)", () => {
    expect(r.margenOperativo).toBe(MARGEN_OPERATIVO_MANUAL);
  });

  it("margen neto: 7,594.99 / 46,051.20 × 100 = 16.49 %", () => {
    expect(r.margenNeto).toBe(razonesManuales.margenNeto);
  });

  it("rentabilidad del activo (ROA): 7,594.99 / 31,960.62 × 100 = 23.76 %", () => {
    expect(r.rentabilidadActivo).toBe(razonesManuales.rentabilidadActivo);
  });

  it("rentabilidad del patrimonio (ROE): 7,594.99 / 29,644.99 × 100 = 25.62 %", () => {
    expect(r.rentabilidadPatrimonio).toBe(razonesManuales.rentabilidadPatrimonio);
  });

  it("las demás razones juntas coinciden con el cálculo manual", () => {
    expect({
      liquidezCorriente: r.liquidezCorriente,
      pruebaAcida: r.pruebaAcida,
      endeudamiento: r.endeudamiento,
      margenBruto: r.margenBruto,
      margenNeto: r.margenNeto,
      rentabilidadActivo: r.rentabilidadActivo,
      rentabilidadPatrimonio: r.rentabilidadPatrimonio,
    }).toEqual(razonesManuales);
  });
});

describe("por sucursal", () => {
  it("la casa matriz, única sucursal con movimientos, da las mismas razones que el consolidado", async () => {
    const { status, cuerpo } = await pedir(
      `desde=2026-10-01&hasta=2026-10-31&sucursalId=${carga.sucursalId}`,
    );
    expect(status).toBe(200);
    expect(cuerpo.sucursalId).toBe(carga.sucursalId);
    expect(cuerpo).toMatchObject(razonesManuales);
  });

  it("una sucursal sin movimientos no divide entre cero: todas las razones son null", async () => {
    const { status, cuerpo } = await pedir(`desde=2026-10-01&hasta=2026-10-31&sucursalId=${sucursalNueva}`);
    expect(status).toBe(200);
    expect(cuerpo).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
      sucursalId: sucursalNueva,
      liquidezCorriente: null,
      pruebaAcida: null,
      endeudamiento: null,
      margenBruto: null,
      margenOperativo: null,
      margenNeto: null,
      rentabilidadActivo: null,
      rentabilidadPatrimonio: null,
    });
  });

  it("quien está limitado a una sucursal sin movimientos ve null y no puede pedir otra (403)", async () => {
    const propia = await pedir("desde=2026-10-01&hasta=2026-10-31", AUXILIAR);
    expect(propia.status).toBe(200);
    expect(propia.cuerpo.liquidezCorriente).toBeNull();
    expect(propia.cuerpo.margenNeto).toBeNull();
    const otra = await pedir(`desde=2026-10-01&hasta=2026-10-31&sucursalId=${carga.sucursalId}`, AUXILIAR);
    expect(otra.status).toBe(403);
  });
});

describe("período sin datos", () => {
  it("enero de 2026, anterior a la apertura: ninguna razón se calcula y no hay división entre cero", async () => {
    const { status, cuerpo } = await pedir("desde=2026-01-01&hasta=2026-01-31");
    expect(status).toBe(200);
    expect(cuerpo).toEqual({
      desde: "2026-01-01",
      hasta: "2026-01-31",
      sucursalId: null,
      liquidezCorriente: null,
      pruebaAcida: null,
      endeudamiento: null,
      margenBruto: null,
      margenOperativo: null,
      margenNeto: null,
      rentabilidadActivo: null,
      rentabilidadPatrimonio: null,
    });
  });
});

describe("permisos y validación", () => {
  it("un usuario sin estados.ver recibe 403", async () => {
    expect((await pedir("desde=2026-10-01&hasta=2026-10-31", SIN_PERMISO)).status).toBe(403);
  });

  it("un usuario ajeno a la empresa recibe 404", async () => {
    expect((await pedir("desde=2026-10-01&hasta=2026-10-31", AJENO)).status).toBe(404);
  });

  it("400 con fechas inválidas; 422 si el período no está en un ejercicio", async () => {
    expect((await pedir("desde=2026-10-31&hasta=2026-10-01")).status).toBe(400);
    expect((await pedir("")).status).toBe(400);
    expect((await pedir("desde=2025-12-01&hasta=2025-12-31")).status).toBe(422);
  });
});
