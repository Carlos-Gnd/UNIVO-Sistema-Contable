// Balanzas de comprobación (HU-30, S2-T32): GET /empresas/:empresa/balanzas/:tipo de punta a punta con PostgreSQL.
// Usa una base propia en el mismo servidor de pruebas que packages/db.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Balanza, TipoBalanza } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const AJENO = "44444444-4444-4444-8444-444444444444";

/** Supabase simulado: el guard real recibe "Bearer <id del usuario>" y lo acepta como válido. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let nit = 100;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_balanzas");
  c = await reiniciarBase(urlBase);
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [CONSULTA, "Consulta"],
    [AJENO, "Ajeno"],
  ]) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${id}@prueba.sv`,
    ]);
  }
  // Un rol sin reportes.ver para probar el 403 (el rol de consulta lo tiene por defecto)
  await c.query(
    `delete from rol_permisos where rol_id = 4 and permiso_id = (select id from permisos where modulo = 'reportes' and accion = 'ver')`,
  );

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

interface Empresa extends Escenario {
  capital: string;
}

/** Empresa nueva con el contador con acceso total y, además del catálogo base, la cuenta 3101 de patrimonio. */
async function empresaNueva(): Promise<Empresa> {
  const esc = await crearEscenario(c, `0614-010190-${String(nit++).padStart(3, "0")}-0`);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, esc.empresaId],
  );
  let capital = "";
  for (const [codigo, nombre] of [
    ["3", "Patrimonio"],
    ["31", "Capital y resultados"],
    ["3101", "Resultado del ejercicio"],
  ] as const) {
    const r = await c.query(
      `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $3, 'acreedora', 'patrimonio') returning id`,
      [esc.empresaId, codigo, nombre],
    );
    if (codigo === "3101") capital = r.rows[0].id as string;
  }
  return { ...esc, capital };
}

const caja = (e: Empresa) => e.cuentas["110101"]!;
const ventas = (e: Empresa) => e.cuentas["5101"]!;

/** Partida contabilizada de dos líneas [cuenta, debe, haber] del tipo y la fecha indicados. */
async function partida(
  e: Empresa,
  fecha: string,
  lineas: [string, string, string][],
  tipo = "operacion",
  sucursalId = e.sucursalId,
): Promise<string> {
  const id = await crearPartida(c, { ...e, sucursalId }, fecha, lineas, tipo);
  await contabilizar(c, id);
  return id;
}

/** Venta de contado de caja contra ventas. */
const venta = (e: Empresa, fecha: string, monto: string, tipo = "operacion", sucursalId = e.sucursalId) =>
  partida(
    e,
    fecha,
    [
      [caja(e), monto, "0"],
      [ventas(e), "0", monto],
    ],
    tipo,
    sucursalId,
  );

async function balanza(
  e: Escenario,
  tipo: string,
  desde: string,
  hasta: string,
  extra: Record<string, string> = {},
  usuario: string | null = CONTADOR,
) {
  const consulta = new URLSearchParams({ desde, hasta, ...extra });
  const r = await fetch(`${url}/empresas/${e.empresaId}/balanzas/${tipo}?${consulta}`, {
    headers: usuario ? { authorization: `Bearer ${usuario}` } : {},
  });
  return { status: r.status, cuerpo: (await r.json()) as Balanza & Record<string, unknown> };
}

const saldos = (b: Balanza) =>
  Object.fromEntries(
    b.lineas.map((l) => [
      l.codigo,
      [
        l.saldoInicialDebe,
        l.saldoInicialHaber,
        l.movimientoDebe,
        l.movimientoHaber,
        l.saldoFinalDebe,
        l.saldoFinalHaber,
      ],
    ]),
  );

describe("las tres balanzas del ejercicio", () => {
  let e: Empresa;

  beforeAll(async () => {
    e = await empresaNueva();
    await venta(e, "2026-11-10", "100.50");
    await venta(e, "2026-12-31", "10.00", "ajuste");
    await partida(
      e,
      "2026-12-31",
      [
        [ventas(e), "110.50", "0"],
        [e.capital, "0", "110.50"],
      ],
      "cierre",
    );
  });

  const pedir = async (tipo: TipoBalanza) => {
    const r = await balanza(e, tipo, "2026-01-01", "2026-12-31");
    expect(r.status).toBe(200);
    return r.cuerpo;
  };

  it("antes de ajustes: sin ajustes ni cierre", async () => {
    const b = await pedir("antes-ajustes");
    expect(saldos(b)).toEqual({
      "110101": ["0.00", "0.00", "100.50", "0.00", "100.50", "0.00"],
      "5101": ["0.00", "0.00", "0.00", "100.50", "0.00", "100.50"],
    });
    expect(b.titulo).toBe("Balanza de comprobación antes de ajustes");
  });

  it("ajustada: suma los ajustes pero no el cierre", async () => {
    const b = await pedir("ajustada");
    expect(saldos(b)).toEqual({
      "110101": ["0.00", "0.00", "110.50", "0.00", "110.50", "0.00"],
      "5101": ["0.00", "0.00", "0.00", "110.50", "0.00", "110.50"],
    });
  });

  it("posterior al cierre: las cuentas de resultado quedan en cero y el resultado pasa al patrimonio", async () => {
    const b = await pedir("posterior-cierre");
    expect(saldos(b)).toEqual({
      "110101": ["0.00", "0.00", "110.50", "0.00", "110.50", "0.00"],
      "3101": ["0.00", "0.00", "0.00", "110.50", "0.00", "110.50"],
      "5101": ["0.00", "0.00", "110.50", "110.50", "0.00", "0.00"],
    });
  });

  it("en las tres, el debe y el haber de cada sección son iguales y la diferencia es cero", async () => {
    for (const tipo of ["antes-ajustes", "ajustada", "posterior-cierre"] as const) {
      const b = await pedir(tipo);
      expect(b.cuadra, tipo).toBe(true);
      expect(b.diferencias, tipo).toEqual({ saldoInicial: "0.00", movimientos: "0.00", saldoFinal: "0.00" });
      expect(b.totales.movimientoDebe).toBe(b.totales.movimientoHaber);
      expect(b.totales.saldoFinalDebe).toBe(b.totales.saldoFinalHaber);
    }
  });

  it("un período posterior arrastra el saldo anterior como saldo inicial", async () => {
    const r = await balanza(e, "ajustada", "2026-12-01", "2026-12-31");
    expect(saldos(r.cuerpo)).toEqual({
      "110101": ["100.50", "0.00", "10.00", "0.00", "110.50", "0.00"],
      "5101": ["0.00", "100.50", "0.00", "10.00", "0.00", "110.50"],
    });
    expect(r.cuerpo.cuadra).toBe(true);
  });

  it("las cuentas sin movimiento ni saldo no aparecen", async () => {
    const r = await balanza(e, "antes-ajustes", "2026-03-01", "2026-03-31");
    expect(r.cuerpo.lineas).toEqual([]);
    expect(r.cuerpo.cuadra).toBe(true);
  });
});

describe("ejercicios anteriores", () => {
  let e: Empresa;

  beforeAll(async () => {
    e = await empresaNueva();
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2025, '2025-01-01', '2025-12-31')`,
      [e.empresaId],
    );
    await venta(e, "2025-06-10", "50.00");
  });

  it("si el ejercicio anterior no se cerró, el saldo inicial no cuadra y la balanza indica la diferencia", async () => {
    const r = await balanza(e, "ajustada", "2026-01-01", "2026-01-31");
    // La caja arrastra su saldo; las ventas (cuenta de resultado) parten de cero: falta el cierre de 2025
    expect(saldos(r.cuerpo)).toEqual({ "110101": ["50.00", "0.00", "0.00", "0.00", "50.00", "0.00"] });
    expect(r.cuerpo.cuadra).toBe(false);
    expect(r.cuerpo.diferencias).toEqual({ saldoInicial: "50.00", movimientos: "0.00", saldoFinal: "50.00" });
  });

  it("con el cierre del ejercicio anterior, el saldo inicial cuadra con el resultado en el patrimonio", async () => {
    await partida(
      e,
      "2025-12-31",
      [
        [ventas(e), "50.00", "0"],
        [e.capital, "0", "50.00"],
      ],
      "cierre",
    );
    const r = await balanza(e, "ajustada", "2026-01-01", "2026-01-31");
    expect(saldos(r.cuerpo)).toEqual({
      "110101": ["50.00", "0.00", "0.00", "0.00", "50.00", "0.00"],
      "3101": ["0.00", "50.00", "0.00", "0.00", "0.00", "50.00"],
    });
    expect(r.cuerpo.cuadra).toBe(true);
  });
});

describe("qué partidas entran", () => {
  it("los borradores no entran", async () => {
    const e = await empresaNueva();
    await venta(e, "2026-11-10", "20.00");
    await crearPartida(c, e, "2026-11-11", [
      [caja(e), "999.99", "0"],
      [ventas(e), "0", "999.99"],
    ]);
    const r = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30");
    expect(r.cuerpo.totales.movimientoDebe).toBe("20.00");
  });

  it("una partida anulada y su reversión se compensan: el saldo queda en cero", async () => {
    const e = await empresaNueva();
    const original = await venta(e, "2026-11-10", "100.00");
    const reversion = await crearPartida(
      c,
      e,
      "2026-11-12",
      [
        [caja(e), "0", "100.00"],
        [ventas(e), "100.00", "0"],
      ],
      "reversion",
    );
    await c.query(`update partidas set partida_revertida_id = $2 where id = $1`, [reversion, original]);
    await contabilizar(c, reversion);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1`, [
      original,
    ]);

    const r = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30");
    expect(saldos(r.cuerpo)).toEqual({
      "110101": ["0.00", "0.00", "100.00", "100.00", "0.00", "0.00"],
      "5101": ["0.00", "0.00", "100.00", "100.00", "0.00", "0.00"],
    });
    expect(r.cuerpo.cuadra).toBe(true);
  });

  it("suma con precisión decimal: diez partidas de 0.10 dan exactamente 1.00", async () => {
    const e = await empresaNueva();
    for (let i = 0; i < 10; i++) await venta(e, "2026-11-10", "0.10");
    const r = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30");
    expect(r.cuerpo.totales).toMatchObject({ movimientoDebe: "1.00", movimientoHaber: "1.00" });
    expect(r.cuerpo.cuadra).toBe(true);
  });
});

describe("sucursales y alcance", () => {
  let e: Empresa;
  let otra: string;

  beforeAll(async () => {
    e = await empresaNueva();
    otra = (
      await c.query(
        `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id`,
        [e.empresaId],
      )
    ).rows[0].id as string;
    await venta(e, "2026-11-10", "100.00");
    await venta(e, "2026-11-10", "40.00", "operacion", otra);

    // El auxiliar solo tiene asignada la casa matriz
    const m = await c.query(
      `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id`,
      [AUXILIAR, e.empresaId],
    );
    await c.query(`insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)`, [
      m.rows[0].id,
      e.sucursalId,
    ]);
  });

  it("sin sucursal es consolidada; con sucursal, solo esa", async () => {
    const todas = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30");
    expect(todas.cuerpo.sucursalId).toBeNull();
    expect(todas.cuerpo.totales.movimientoDebe).toBe("140.00");

    const matriz = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30", {
      sucursalId: e.sucursalId,
    });
    expect(matriz.cuerpo.sucursalId).toBe(e.sucursalId);
    expect(matriz.cuerpo.totales.movimientoDebe).toBe("100.00");

    const usulutan = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30", { sucursalId: otra });
    expect(usulutan.cuerpo.totales.movimientoDebe).toBe("40.00");
    expect(usulutan.cuerpo.cuadra).toBe(true);
  });

  it("quien tiene acceso a una sola sucursal ve en la consolidada solo la suya", async () => {
    const r = await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30", {}, AUXILIAR);
    expect(r.status).toBe(200);
    expect(r.cuerpo.totales.movimientoDebe).toBe("100.00");
  });

  it("no le deja pedir otra sucursal ni una que no existe en la empresa", async () => {
    expect(
      (await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30", { sucursalId: otra }, AUXILIAR)).status,
    ).toBe(403);
    const ajena = (await empresaNueva()).sucursalId;
    expect(
      (await balanza(e, "antes-ajustes", "2026-11-01", "2026-11-30", { sucursalId: ajena })).status,
    ).toBe(403);
  });
});

describe("validaciones y permisos", () => {
  let e: Empresa;

  beforeAll(async () => {
    e = await empresaNueva();
    const m = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 4, false) returning id",
      [CONSULTA, e.empresaId],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0].id,
      e.sucursalId,
    ]);
  });

  it("exige un token válido", async () => {
    expect((await balanza(e, "ajustada", "2026-11-01", "2026-11-30", {}, null)).status).toBe(401);
  });

  it("rechaza un tipo de balanza o unas fechas inválidas con 400", async () => {
    expect((await balanza(e, "otra", "2026-11-01", "2026-11-30")).status).toBe(400);
    expect((await balanza(e, "ajustada", "01/11/2026", "2026-11-30")).status).toBe(400);
    const invertida = await balanza(e, "ajustada", "2026-11-30", "2026-11-01");
    expect(invertida.status).toBe(400);
    expect(invertida.cuerpo["errores"]).toMatchObject({
      desde: ["La fecha inicial no puede ser posterior a la final."],
    });
  });

  it("el período debe estar dentro de un ejercicio: 422", async () => {
    expect((await balanza(e, "ajustada", "2030-01-01", "2030-01-31")).status).toBe(422);
    expect((await balanza(e, "ajustada", "2026-11-01", "2027-01-31")).status).toBe(422);
  });

  it("sin el permiso reportes.ver responde 403 y a quien no es de la empresa, 404", async () => {
    expect((await balanza(e, "ajustada", "2026-11-01", "2026-11-30", {}, CONSULTA)).status).toBe(403);
    expect((await balanza(e, "ajustada", "2026-11-01", "2026-11-30", {}, AJENO)).status).toBe(404);
  });
});
