// Tablero de CheroPhonex (HU-83, S4-T21): las cifras del tablero deben coincidir con los estados financieros del caso
// (octubre de 2026, 44 partidas). Se comparan tres fuentes independientes entre sí:
//   1. los resultados esperados del ejercicio (`cherophonex.json`, calculados a mano, fuera del sistema);
//   2. el estado de resultados y las razones financieras que devuelve la API;
//   3. el tablero (`GET /empresas/:id/tablero?mes=2026-10`).
//
//   ventas netas ......... 46,051.20      utilidad bruta ... 11,939.20 (25.93 % de las ventas)
//   costo de ventas ...... 34,112.00      utilidad neta .... 7,594.99  (16.49 % de las ventas)
//   efectivo y bancos .... 22,270.89 (110101 + 110102 + 11010301 del balance posterior al cierre)
//
// Criterio del tablero: igual que el estado de resultados, separa los gastos de operación (4,329.21) de los costos
// financieros (4203, 15.00, etapa propia), de modo que la cascada ventas → costo → bruta → gastos → financieros →
// utilidad cuadra con la utilidad neta.
// Esta prueba no repite las de tablero.test.ts (ventas por documento, productos y categorías, sucursales de una
// empresa comercial): cubre el cuadre contra los estados del caso, y los períodos y alcances sin datos.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero, type EstadoResultados, type RazonesFinancieras } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import type { TableroIndicadores } from "../src/modules/analitica/domain/tablero.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // limitado a una sucursal sin movimientos
const SIN_PERMISO = "33333333-3333-4333-8333-333333333333"; // rol al que se le quita analitica.ver
const AJENO = "44444444-4444-4444-8444-444444444444";

const caso = leerCaso();
const esperado = caso.esperado;
const porcentaje = (parte: string, total: string) => Dinero.de(parte).por(100).dividido(total).aTexto();

/** Efectivo y bancos (1101*) del balance posterior al cierre del caso. */
const efectivoDelCaso = Object.entries(esperado.balanzas["posterior-cierre"].cuentas)
  .filter(([codigo]) => codigo.startsWith("1101"))
  .reduce(
    (total, [, cuenta]) => total.mas(Dinero.de(cuenta.saldoDeudor).menos(cuenta.saldoAcreedor)),
    Dinero.cero(),
  )
  .aTexto();

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;

async function leer<T>(ruta: string, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    headers: { authorization: `Bearer ${usuario}` },
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}
const tablero = (query: string, usuario = CONTADOR) => leer<TableroIndicadores>(`/tablero${query}`, usuario);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_tablero_cherophonex");
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
      `${nombre.toLowerCase().replace(" ", "-")}@tablero-caso.test`,
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
  // El rol de solo consulta (4) pierde analitica.ver únicamente en esta base de pruebas descartable.
  await c.query(
    "delete from rol_permisos where rol_id = 4 and permiso_id = (select id from permisos where modulo = 'analitica' and accion = 'ver')",
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

describe("octubre de 2026 contra los resultados esperados del caso", () => {
  let t: TableroIndicadores;
  beforeAll(async () => {
    const r = await tablero("?mes=2026-10");
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    t = r.cuerpo;
  });

  it("ventas netas, utilidad bruta y utilidad del ejercicio son las del caso", () => {
    expect(t.ventasNetas).toBe(Dinero.de(esperado.estadoDeResultados.ventasNetas).aTexto());
    expect(t.utilidadBruta).toBe(Dinero.de(esperado.estadoDeResultados.utilidadBruta).aTexto());
    expect(t.utilidadEjercicio).toBe(Dinero.de(esperado.estadoDeResultados.utilidadNeta).aTexto());
  });

  it("el efectivo es el saldo de efectivo y bancos del balance posterior al cierre", () => {
    expect(t.efectivo).toBe("22270.89");
    expect(t.efectivo).toBe(efectivoDelCaso);
  });

  it("los márgenes son utilidad / ventas × 100: 25.93 % bruto y 16.49 % neto", () => {
    expect(t.margenBruto).toBe("25.93");
    expect(t.margenNeto).toBe("16.49");
    expect(t.margenBruto).toBe(
      porcentaje(esperado.estadoDeResultados.utilidadBruta, esperado.estadoDeResultados.ventasNetas),
    );
    expect(t.margenNeto).toBe(
      porcentaje(esperado.estadoDeResultados.utilidadNeta, esperado.estadoDeResultados.ventasNetas),
    );
  });

  it("la cascada de utilidad cuadra: ventas − costo − gastos − costos financieros = utilidad del ejercicio, con sus porcentajes", () => {
    const etapa = (id: string) => t.etapasUtilidad.find((e) => e.id === id)!;
    expect(t.etapasUtilidad.map((e) => e.id)).toEqual([
      "ventas",
      "costo-ventas",
      "utilidad-bruta",
      "gastos-operacion",
      "costos-financieros",
      "utilidad-ejercicio",
    ]);
    expect(etapa("ventas")).toMatchObject({ monto: "46051.20", porcentajeVentas: "100.00" });
    // Los costos y gastos se muestran en negativo
    expect(etapa("costo-ventas")).toMatchObject({
      monto: Dinero.de(esperado.estadoDeResultados.costoDeVentas).por(-1).aTexto(),
      porcentajeVentas: "74.07",
    });
    expect(etapa("utilidad-bruta")).toMatchObject({
      monto: t.utilidadBruta,
      porcentajeVentas: t.margenBruto,
    });
    expect(etapa("utilidad-ejercicio")).toMatchObject({
      monto: t.utilidadEjercicio,
      porcentajeVentas: t.margenNeto,
    });
    const recorrido = Dinero.de(etapa("ventas").monto)
      .mas(etapa("costo-ventas").monto)
      .mas(etapa("gastos-operacion").monto)
      .mas(etapa("costos-financieros").monto)
      .aTexto();
    expect(etapa("gastos-operacion").monto).toBe("-4329.21");
    expect(etapa("costos-financieros").monto).toBe("-15.00");
    expect(recorrido).toBe(t.utilidadEjercicio);
  });

  it("sin documentos comerciales no hay ventas semanales, productos ni categorías (el caso se registra por partidas)", () => {
    expect(t.ventasSemanales).toHaveLength(5);
    expect(
      t.ventasSemanales.every((s) => s.comprobantesCreditoFiscal === "0.00" && s.consumidorFinal === "0.00"),
    ).toBe(true);
    expect(t.productosRentables).toEqual([]);
    expect(t.categorias).toEqual([]);
  });
});

describe("coincide con los estados financieros y las razones que devuelve la API", () => {
  it("ventas, costo, utilidad bruta y utilidad neta igualan al estado de resultados de octubre", async () => {
    const er = await leer<EstadoResultados>("/estados/resultados?desde=2026-10-01&hasta=2026-10-31");
    expect(er.status).toBe(200);
    const { cuerpo: t } = await tablero("?mes=2026-10");
    expect(t.ventasNetas).toBe(er.cuerpo.ventas.total);
    expect(t.utilidadBruta).toBe(er.cuerpo.utilidadBruta);
    expect(t.utilidadEjercicio).toBe(er.cuerpo.utilidadNeta);
    const costo = t.etapasUtilidad.find((e) => e.id === "costo-ventas")!;
    expect(costo.monto).toBe(Dinero.de(er.cuerpo.costoVentas.total).por(-1).aTexto());
    // Los gastos de operación y los costos financieros del tablero son los renglones del estado de resultados
    const gastos = t.etapasUtilidad.find((e) => e.id === "gastos-operacion")!;
    expect(gastos.monto).toBe(
      Dinero.de(er.cuerpo.gastosOperacion.total).mas(er.cuerpo.otrosGastos.total).por(-1).aTexto(),
    );
    const financieros = t.etapasUtilidad.find((e) => e.id === "costos-financieros")!;
    expect(financieros.monto).toBe(Dinero.de(er.cuerpo.costosFinancieros.total).por(-1).aTexto());
  });

  it("los márgenes bruto y neto igualan a los de las razones financieras (S4-T24)", async () => {
    const razones = await leer<RazonesFinancieras>(
      "/estados/razones-financieras?desde=2026-10-01&hasta=2026-10-31",
    );
    expect(razones.status).toBe(200);
    const { cuerpo: t } = await tablero("?mes=2026-10");
    expect(t.margenBruto).toBe(razones.cuerpo.margenBruto);
    expect(t.margenNeto).toBe(razones.cuerpo.margenNeto);
  });

  it("el efectivo coincide con los saldos de las cuentas de efectivo y bancos del libro mayor", async () => {
    const saldo = await c.query<{ saldo: string }>(
      `select coalesce(sum(d.debe - d.haber), 0)::text as saldo
       from partida_detalles d
       join partidas p on p.id = d.partida_id
       join cuentas k on k.id = d.cuenta_id
       where p.empresa_id = $1 and p.estado in ('contabilizada', 'anulada') and p.fecha <= '2026-10-31'
         and k.codigo like '1101%'`,
      [carga.empresaId],
    );
    expect((await tablero("?mes=2026-10")).cuerpo.efectivo).toBe(Dinero.de(saldo.rows[0]!.saldo).aTexto());
  });
});

describe("por sucursal", () => {
  it("la casa matriz, única con movimientos, da las mismas cifras que el consolidado", async () => {
    const consolidado = await tablero("?mes=2026-10");
    const matriz = await tablero(`?mes=2026-10&sucursalId=${carga.sucursalId}`);
    expect(matriz.status).toBe(200);
    expect(matriz.cuerpo).toEqual(consolidado.cuerpo);
  });

  it("una sucursal sin movimientos muestra todo en cero, sin dividir entre cero", async () => {
    const r = await tablero(`?mes=2026-10&sucursalId=${sucursalNueva}`);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      ventasNetas: "0.00",
      utilidadBruta: "0.00",
      utilidadEjercicio: "0.00",
      efectivo: "0.00",
      margenBruto: "0.00",
      margenNeto: "0.00",
      productosRentables: [],
      categorias: [],
    });
    expect(r.cuerpo.etapasUtilidad.every((e) => e.monto === "0.00")).toBe(true);
  });

  it("quien está limitado a una sucursal ve solo la suya (en cero) y no puede pedir otra (403)", async () => {
    const propia = await tablero("?mes=2026-10", AUXILIAR);
    expect(propia.status).toBe(200);
    expect(propia.cuerpo.ventasNetas).toBe("0.00");
    expect(propia.cuerpo.efectivo).toBe("0.00");
    const ajena = await tablero(`?mes=2026-10&sucursalId=${carga.sucursalId}`, AUXILIAR);
    expect(ajena.status).toBe(403);
  });
});

describe("otros meses y alcance de los datos", () => {
  it("antes de la apertura (enero y septiembre) todo está en cero", async () => {
    for (const mes of ["2026-01", "2026-09"]) {
      const r = await tablero(`?mes=${mes}`);
      expect(r.status, mes).toBe(200);
      expect(r.cuerpo, mes).toMatchObject({
        ventasNetas: "0.00",
        utilidadBruta: "0.00",
        utilidadEjercicio: "0.00",
        efectivo: "0.00",
        margenBruto: "0.00",
        margenNeto: "0.00",
      });
    }
  });

  it("noviembre y diciembre no tienen resultados, pero el efectivo conserva el saldo acumulado", async () => {
    for (const mes of ["2026-11", "2026-12"]) {
      const r = await tablero(`?mes=${mes}`);
      expect(r.status, mes).toBe(200);
      expect(r.cuerpo, mes).toMatchObject({
        ventasNetas: "0.00",
        utilidadEjercicio: "0.00",
        margenNeto: "0.00",
        efectivo: efectivoDelCaso,
      });
    }
  });

  it("una partida en borrador no altera el tablero", async () => {
    const antes = (await tablero("?mes=2026-10")).cuerpo;
    const cuentas = await c.query<{ codigo: string; id: string }>(
      `select codigo, id from cuentas where empresa_id = $1 and codigo in ('110101', '510101')`,
      [carga.empresaId],
    );
    const id = (codigo: string) => cuentas.rows.find((k) => k.codigo === codigo)!.id;
    const partida = await c.query<{ id: string }>(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
       values ($1, $2, '2026-10-20', 'operacion', 'Venta en borrador que no debe verse en el tablero') returning id`,
      [carga.empresaId, carga.sucursalId],
    );
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
       values ($1, $2, 999, 0, 0), ($1, $3, 0, 999, 1)`,
      [partida.rows[0]!.id, id("110101"), id("510101")],
    );
    expect(
      (await c.query("select estado::text from partidas where id = $1", [partida.rows[0]!.id])).rows[0]
        .estado,
    ).toBe("borrador");
    expect((await tablero("?mes=2026-10")).cuerpo).toEqual(antes);
  });
});

describe("permisos y validación", () => {
  it("sin analitica.ver da 403; ajeno a la empresa, 404; sin sesión, 401", async () => {
    expect((await tablero("?mes=2026-10", SIN_PERMISO)).status).toBe(403);
    expect((await tablero("?mes=2026-10", AJENO)).status).toBe(404);
    const sinSesion = await fetch(`${url}/empresas/${carga.empresaId}/tablero?mes=2026-10`);
    expect(sinSesion.status).toBe(401);
  });

  it("mes sin formato AAAA-MM o ausente da 400; un año sin ejercicio, 404", async () => {
    expect((await tablero("?mes=2026-13")).status).toBe(400);
    expect((await tablero("?mes=octubre")).status).toBe(400);
    expect((await tablero("")).status).toBe(400);
    expect((await tablero("?mes=2025-12")).status).toBe(404);
  });
});
