// Pago a cuenta del 1.75 % y retenciones de renta (HU-49, S3-T46 y S3-T48).
//
// Dos escenarios en la misma base: CheroPhonex sin su partida 40 (la que se genera aquí) para comprobar el pago a
// cuenta de US$ 805.90 de octubre, y una empresa mínima para las retenciones, las exclusiones y los permisos.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PagoACuentaVista, PagosACuentaEjercicioVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cargarCasoCherophonex,
  leerCaso,
  type CasoCargado,
} from "../../../packages/db/src/casos/cherophonex";
import {
  basePropia,
  contabilizar,
  crearEscenario,
  crearPartida,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const AJENO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let esc: Escenario;
let ajena: Escenario;

async function pedir<T = Record<string, unknown>>(
  metodo: "GET" | "POST",
  ruta: string,
  usuario: string | null,
  empresaId: string,
  cuerpo?: unknown,
) {
  const r = await fetch(`${url}/empresas/${empresaId}/pago-a-cuenta${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const consultar = (empresaId: string, anio: number, mes: number, usuario: string | null = CONTADOR) =>
  pedir<PagoACuentaVista>("GET", `?anio=${anio}&mes=${mes}`, usuario, empresaId);
const generar = (empresaId: string, anio: number, mes: number, usuario: string | null = CONTADOR) =>
  pedir<PagoACuentaVista>("POST", "/partida", usuario, empresaId, { anio, mes });
const presentar = (empresaId: string, anio: number, mes: number) =>
  pedir<PagoACuentaVista>("POST", "/presentar", CONTADOR, empresaId, { anio, mes });

async function usuario(id: string, rol: number, empresaId: string, sucursalId?: string) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3) on conflict (id) do nothing", [
    id,
    `Usuario ${rol}`,
    `${id}@pago-a-cuenta.test`,
  ]);
  const m = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresaId, rol, sucursalId === undefined],
  );
  if (sucursalId !== undefined) {
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0]!.id,
      sucursalId,
    ]);
  }
}

async function cuenta(empresa: Escenario, codigo: string, nombre: string, naturaleza: string, tipo: string) {
  const r = await c.query<{ id: string }>(
    "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, $4, $5) returning id",
    [empresa.empresaId, codigo, nombre, naturaleza, tipo],
  );
  empresa.cuentas[codigo] = r.rows[0]!.id;
}

/** Partida contabilizada (o en borrador) con la cuenta de caja y una cuenta de contrapartida. */
async function partida(
  empresa: Escenario,
  fecha: string,
  lineas: [string, string, string][],
  opciones: { origen?: string; contabilizada?: boolean; tipo?: string } = {},
) {
  const id = await crearPartida(
    c,
    empresa,
    fecha,
    lineas.map(([codigo, debe, haber]) => [empresa.cuentas[codigo]!, debe, haber]),
    opciones.tipo ?? "operacion",
  );
  if (opciones.origen) await c.query("update partidas set origen = $2 where id = $1", [id, opciones.origen]);
  if (opciones.contabilizada !== false) await contabilizar(c, id);
  return id;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_pago_a_cuenta");
  c = await reiniciarBase(urlBase);

  // CheroPhonex sin la partida 40 (determinación del pago a cuenta): la genera el sistema
  const caso = leerCaso();
  carga = await cargarCasoCherophonex(c, {
    ...caso,
    partidas: caso.partidas.filter((p) => p.numero !== 40),
  });
  await usuario(CONTADOR, 2, carga.empresaId);

  esc = await crearEscenario(c, "0614-720301-101-1");
  ajena = await crearEscenario(c, "0614-720302-101-2");
  for (const empresa of [esc, ajena]) {
    await cuenta(empresa, "1111", "Gastos Pagados por Anticipado", "deudora", "activo");
    await cuenta(empresa, "111104", "Pago a Cuenta", "deudora", "activo");
    await cuenta(empresa, "2", "Pasivo", "acreedora", "pasivo");
    await cuenta(empresa, "21", "Pasivo Corriente", "acreedora", "pasivo");
    await cuenta(empresa, "2111", "Impuestos por Pagar", "acreedora", "pasivo");
    await cuenta(empresa, "211101", "Pago a Cuenta", "acreedora", "pasivo");
    await cuenta(empresa, "2106", "Retenciones por Pagar", "acreedora", "pasivo");
    await cuenta(empresa, "210604", "Renta", "acreedora", "pasivo");
  }
  await usuario(CONTADOR, 2, esc.empresaId);
  await usuario(AUXILIAR, 3, esc.empresaId, esc.sucursalId);
  await usuario(AJENO, 2, ajena.empresaId);

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

describe("pago a cuenta de CheroPhonex, octubre de 2026 (US$ 805.90)", () => {
  it("1.75 % de los ingresos brutos de octubre, sin contar la partida de cierre que liquida las ventas", async () => {
    const r = await consultar(carga.empresaId, 2026, 10);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      anio: 2026,
      mes: 10,
      fechaPartida: "2026-10-31",
      tasa: "1.75",
      ingresosBrutos: "46051.20",
      pagoACuenta: "805.90",
      retencionesPlanilla: "0.00",
      retencionesServicios: "0.00",
      totalAEnterar: "805.90",
      declaracion: null,
      periodoAbierto: true,
    });
    expect(r.cuerpo.lineasPartida.map((l) => [l.codigo, l.debe, l.haber])).toEqual([
      ["111104", "805.90", "0.00"],
      ["211101", "0.00", "805.90"],
    ]);
  });

  it("genera en borrador la misma partida del ejercicio (Dr 111104 / Cr 211101) y la deja ligada al mes", async () => {
    const r = await generar(carga.empresaId, 2026, 10);
    expect(r.status).toBe(201);
    expect(r.cuerpo.declaracion).toMatchObject({
      estadoPartida: "borrador",
      pagoACuenta: "805.90",
      ingresosBrutos: "46051.20",
      presentadaEn: null,
      desactualizada: false,
    });
    const filas = await c.query(
      `select p.tipo, p.origen, p.fecha::text, p.estado, p.sucursal_id, c.codigo, d.debe::text, d.haber::text
       from partidas p join partida_detalles d on d.partida_id = p.id join cuentas c on c.id = d.cuenta_id
       where p.id = $1 order by d.orden`,
      [r.cuerpo.declaracion!.partidaId],
    );
    expect(filas.rows.map((f) => [f.codigo, f.debe, f.haber])).toEqual([
      ["111104", "805.90", "0.00"],
      ["211101", "0.00", "805.90"],
    ]);
    expect(filas.rows[0]).toMatchObject({
      tipo: "ajuste",
      origen: "pago_a_cuenta",
      fecha: "2026-10-31",
      estado: "borrador",
      sucursal_id: carga.sucursalId,
    });
  });

  it("no genera dos veces el mismo mes (409) ni se presenta con la partida en borrador (422)", async () => {
    expect((await generar(carga.empresaId, 2026, 10)).status).toBe(409);
    const r = await presentar(carga.empresaId, 2026, 10);
    expect(r.status).toBe(422);
  });

  it("al contabilizar la partida, el mes se presenta y el ejercicio expone el total que acredita el ISR anual", async () => {
    const id = (await consultar(carga.empresaId, 2026, 10)).cuerpo.declaracion!.partidaId;
    await contabilizar(c, id);

    const ejercicio = await pedir<PagosACuentaEjercicioVista>(
      "GET",
      "/ejercicios/2026",
      CONTADOR,
      carga.empresaId,
    );
    expect(ejercicio.status).toBe(200);
    expect(ejercicio.cuerpo.totalContabilizado).toBe("805.90");
    expect(ejercicio.cuerpo.totalEnBorrador).toBe("0.00");
    expect(ejercicio.cuerpo.meses[9]).toEqual({
      mes: 10,
      pagoACuenta: "805.90",
      estadoPartida: "contabilizada",
      presentada: false,
    });

    // Lo mismo que lee el cierre anual (HU-34): el movimiento neto de la cuenta 111104 del ejercicio
    const movimiento = await c.query(
      `select coalesce(sum(d.debe - d.haber), 0)::text as neto
       from partida_detalles d join partidas p on p.id = d.partida_id join cuentas k on k.id = d.cuenta_id
       where p.empresa_id = $1 and p.estado in ('contabilizada', 'anulada') and k.codigo like '111104%'`,
      [carga.empresaId],
    );
    expect(movimiento.rows[0].neto).toBe("805.90");

    const presentada = await presentar(carga.empresaId, 2026, 10);
    expect(presentada.status).toBe(201);
    expect(presentada.cuerpo.declaracion?.presentadaEn).not.toBeNull();
    expect((await generar(carga.empresaId, 2026, 10)).status).toBe(409);
  });
});

describe("ingresos y retenciones del mes", () => {
  beforeAll(async () => {
    // Noviembre de 2026 de la empresa mínima
    await partida(esc, "2026-11-05", [
      ["110101", "1000.00", "0"],
      ["5101", "0", "1000.00"],
    ]);
    // Una venta registrada dos veces y anulada: la reversión la compensa
    const duplicada = await partida(esc, "2026-11-06", [
      ["110101", "400.00", "0"],
      ["5101", "0", "400.00"],
    ]);
    const anulada = await fetch(`${url}/empresas/${esc.empresaId}/partidas/${duplicada}/anular`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
      body: JSON.stringify({ motivo: "Venta registrada dos veces", fecha: "2026-11-07" }),
    });
    expect(anulada.status).toBe(200);
    // Los borradores nunca cuentan
    await partida(
      esc,
      "2026-11-08",
      [
        ["110101", "9999.00", "0"],
        ["5101", "0", "9999.00"],
      ],
      {
        contabilizada: false,
      },
    );
    // Ventas de otro mes
    await partida(esc, "2026-12-02", [
      ["110101", "700.00", "0"],
      ["5101", "0", "700.00"],
    ]);
    // Renta retenida a empleados (planilla) y por servicios, y un pago de retenciones que no las reduce
    await partida(
      esc,
      "2026-11-30",
      [
        ["110101", "100.00", "0"],
        ["210604", "0", "100.00"],
      ],
      {
        origen: "planilla",
      },
    );
    await partida(esc, "2026-11-20", [
      ["110101", "40.00", "0"],
      ["210604", "0", "40.00"],
    ]);
    await partida(esc, "2026-11-25", [
      ["210604", "30.00", "0"],
      ["110101", "0", "30.00"],
    ]);
    // Un borrador de retención tampoco cuenta
    await partida(
      esc,
      "2026-11-21",
      [
        ["110101", "77.00", "0"],
        ["210604", "0", "77.00"],
      ],
      {
        contabilizada: false,
      },
    );
  });

  it("suma ventas contabilizadas y anuladas (compensadas), nunca borradores, y separa planilla de servicios", async () => {
    const r = await consultar(esc.empresaId, 2026, 11);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      ingresosBrutos: "1000.00",
      pagoACuenta: "17.50",
      retencionesPlanilla: "100.00",
      retencionesServicios: "40.00",
      totalRetenciones: "140.00",
      totalAEnterar: "157.50",
    });
  });

  it("base del Art. 151 CT: suma la clase 52, deja fuera 5202 y resta devoluciones y rebajas (4103)", async () => {
    await cuenta(esc, "4", "Cuentas de Resultado Deudoras", "deudora", "costos_gastos");
    await cuenta(esc, "41", "Costos", "deudora", "costos_gastos");
    await cuenta(esc, "4103", "(R) Devoluciones y Rebajas sobre Ventas", "deudora", "costos_gastos");
    await cuenta(esc, "52", "Otros Ingresos", "acreedora", "ingresos");
    await cuenta(esc, "5201", "Ingresos Financieros", "acreedora", "ingresos");
    await cuenta(esc, "5202", "Ganancia en Venta de Activo de Explotación", "acreedora", "ingresos");
    await partida(esc, "2026-08-05", [
      ["110101", "2000.00", "0"],
      ["5101", "0", "2000.00"],
    ]);
    await partida(esc, "2026-08-10", [
      ["110101", "50.00", "0"],
      ["5201", "0", "50.00"],
    ]);
    await partida(esc, "2026-08-12", [
      ["110101", "900.00", "0"],
      ["5202", "0", "900.00"],
    ]);
    await partida(esc, "2026-08-15", [
      ["4103", "150.00", "0"],
      ["110101", "0", "150.00"],
    ]);
    // 2000 + 50 - 150 = 1900 (5202 no entra); 1.75 % = 33.25
    const r = await consultar(esc.empresaId, 2026, 8);
    expect(r.cuerpo).toMatchObject({ ingresosBrutos: "1900.00", pagoACuenta: "33.25" });
  });

  it("otro mes de la misma empresa no se mezcla", async () => {
    const r = await consultar(esc.empresaId, 2026, 12);
    expect(r.cuerpo).toMatchObject({
      ingresosBrutos: "700.00",
      pagoACuenta: "12.25",
      totalRetenciones: "0.00",
    });
  });

  it("un mes sin ingresos no genera partida (422)", async () => {
    const r = await generar(esc.empresaId, 2026, 9);
    expect(r.status).toBe(422);
    expect(r.cuerpo).toMatchObject({ message: expect.stringContaining("No hay ingresos brutos") });
  });

  it("si cambian las cifras después de generar, la declaración queda marcada como desactualizada", async () => {
    const generada = await generar(esc.empresaId, 2026, 11);
    expect(generada.status).toBe(201);
    expect(generada.cuerpo.declaracion).toMatchObject({
      retencionesPlanilla: "100.00",
      retencionesServicios: "40.00",
      desactualizada: false,
    });
    await partida(esc, "2026-11-28", [
      ["110101", "10.00", "0"],
      ["210604", "0", "10.00"],
    ]);
    const r = await consultar(esc.empresaId, 2026, 11);
    expect(r.cuerpo.retencionesServicios).toBe("50.00");
    expect(r.cuerpo.declaracion).toMatchObject({ desactualizada: true, retencionesServicios: "40.00" });
  });

  it("si la partida se anula, se puede generar de nuevo con las cifras vigentes", async () => {
    const id = (await consultar(esc.empresaId, 2026, 11)).cuerpo.declaracion!.partidaId;
    await contabilizar(c, id);
    const anulada = await fetch(`${url}/empresas/${esc.empresaId}/partidas/${id}/anular`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CONTADOR}` },
      body: JSON.stringify({ motivo: "Se corrige el cálculo", fecha: "2026-11-30" }),
    });
    expect(anulada.status).toBe(200);
    const nueva = await generar(esc.empresaId, 2026, 11);
    expect(nueva.status).toBe(201);
    expect(nueva.cuerpo.declaracion).toMatchObject({
      estadoPartida: "borrador",
      retencionesServicios: "50.00",
      desactualizada: false,
    });
    expect(nueva.cuerpo.declaracion!.partidaId).not.toBe(id);
  });

  it("en un período cerrado no se genera la partida (422)", async () => {
    await c.query(
      "update periodos set estado = 'cerrado' where empresa_id = $1 and fecha_inicio = '2026-12-01'",
      [esc.empresaId],
    );
    const r = await generar(esc.empresaId, 2026, 12);
    expect(r.status).toBe(422);
    expect((await consultar(esc.empresaId, 2026, 12)).cuerpo.periodoAbierto).toBe(false);
  });
});

describe("permisos y datos", () => {
  it("sin sesión 401; usuario con una sola sucursal 403; empresa ajena 404", async () => {
    expect((await consultar(esc.empresaId, 2026, 11, null)).status).toBe(401);
    expect((await consultar(esc.empresaId, 2026, 11, AUXILIAR)).status).toBe(403);
    expect((await consultar(esc.empresaId, 2026, 11, AJENO)).status).toBe(404);
    expect((await generar(esc.empresaId, 2026, 11, AJENO)).status).toBe(404);
  });

  it("rechaza mes o año inválidos (400)", async () => {
    expect((await consultar(esc.empresaId, 2026, 13)).status).toBe(400);
    expect((await consultar(esc.empresaId, 1999, 1)).status).toBe(400);
    expect((await pedir("POST", "/partida", CONTADOR, esc.empresaId, { anio: 2026 })).status).toBe(400);
  });

  it("presentar un mes sin partida generada da 404", async () => {
    expect((await presentar(esc.empresaId, 2026, 3)).status).toBe(404);
  });

  it("la base impide presentar o borrar un pago a cuenta ya presentado", async () => {
    const intento = await c
      .query(
        `update pagos_a_cuenta set pago_a_cuenta = 1 where empresa_id = $1 and presentada_en is not null`,
        [carga.empresaId],
      )
      .then(
        () => null,
        (e: Error) => e.message,
      );
    expect(intento).toContain("ya presentado");
  });
});
