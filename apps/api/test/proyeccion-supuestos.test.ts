// Proyección de CheroPhonex (HU-85, S4-T27): la proyección respeta los supuestos que pide el usuario y no modifica
// datos reales (no crea partidas ni cambia nada). Complementa proyecciones.test.ts (que prueba el historial de siete
// meses y el método de regresión) y el dominio (proyecciones.test.ts en reportes/domain).
//
// El historial es el del caso: un solo mes contabilizado (octubre de 2026), así que el método es promedio móvil y la
// base de cada serie es el valor de octubre. Cálculo manual de la base (estado de resultados y balance del caso):
//   ventas netas ............. 46,051.20
//   costos y gastos .......... 34,112.00 (costo de ventas) + 4,329.21 (gastos de operación) + 15.00 (financieros)
//                              = 38,456.21
//   utilidad base ............ 46,051.20 − 38,456.21 = 7,594.99 (la utilidad neta del caso)
// Con crecimiento mensual g, el mes n vale base × (1 + g)^n (crecimiento compuesto):
//   ventas +10 %:  50,656.32 · 55,721.95 · 61,294.15        gastos +5 %: 40,379.02 · 42,397.97 · 44,517.87
//   utilidad = ventas − gastos (sin redondear antes): 10,277.30 · 13,323.98 · 16,776.28
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Dinero } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, type CasoCargado } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";
import type { PeriodoProyectado, ProyeccionFinanciera } from "../src/modules/reportes/domain/proyecciones.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // limitado a una sucursal sin movimientos
const SIN_PERMISO = "33333333-3333-4333-8333-333333333333"; // rol al que se le quita analitica.ver
const AJENO = "44444444-4444-4444-8444-444444444444";

const VENTAS_BASE = "46051.20";
const GASTOS_BASE = "38456.21";
const UTILIDAD_BASE = "7594.99";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;

async function proyectar(cuerpo: unknown, usuario: string | null = CONTADOR, empresaId?: string) {
  const r = await fetch(`${url}/empresas/${empresaId ?? carga.empresaId}/estados/proyecciones`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as ProyeccionFinanciera };
}

const supuestos = (extra: Record<string, unknown> = {}) => ({
  meses: 3,
  crecimientoVentasMensual: 0,
  crecimientoGastosMensual: 0,
  ...extra,
});

async function periodos(cuerpo: unknown): Promise<PeriodoProyectado[]> {
  const r = await proyectar(cuerpo);
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
  return r.cuerpo.periodos;
}

/** Foto de los datos reales: filas de cada tabla y un resumen del contenido de las partidas. */
async function foto() {
  const tablas = await c.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  const filas: Record<string, number> = {};
  for (const { tablename } of tablas.rows) {
    filas[tablename] = Number(
      (await c.query<{ n: string }>(`select count(*)::text n from "${tablename}"`)).rows[0]!.n,
    );
  }
  const contenido = await c.query<{ huella: string }>(
    `select md5(coalesce(string_agg(p::text, '|' order by p.id), '') || '#' ||
                coalesce((select string_agg(d::text, '|' order by d.id) from partida_detalles d), '')) as huella
     from partidas p`,
  );
  return { filas, huella: contenido.rows[0]!.huella };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_proyeccion_supuestos");
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
      `${nombre.toLowerCase().replace(" ", "-")}@proyeccion.test`,
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

describe("la proyección respeta los supuestos", () => {
  it("sin crecimiento repite la base de octubre durante los meses pedidos", async () => {
    const r = await proyectar(supuestos());
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo).toMatchObject({ calculadaConDatosHasta: "2026-10-01", metodo: "promedio-movil" });
    expect(r.cuerpo.periodos.map((p) => p.mes)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    for (const p of r.cuerpo.periodos) {
      expect(p.ventas.estimado).toBe(VENTAS_BASE);
      expect(p.gastos.estimado).toBe(GASTOS_BASE);
      expect(p.utilidad.estimado).toBe(UTILIDAD_BASE);
    }
  });

  it("la base de la proyección es la utilidad real del caso: ventas − costos y gastos = utilidad neta", () => {
    expect(Dinero.de(VENTAS_BASE).menos(GASTOS_BASE).aTexto()).toBe(UTILIDAD_BASE);
  });

  it("aplica el crecimiento de ventas y de gastos compuesto mes a mes (+10 % y +5 %)", async () => {
    const p = await periodos(supuestos({ crecimientoVentasMensual: 10, crecimientoGastosMensual: 5 }));
    expect(p.map((x) => x.ventas.estimado)).toEqual(["50656.32", "55721.95", "61294.15"]);
    expect(p.map((x) => x.gastos.estimado)).toEqual(["40379.02", "42397.97", "44517.87"]);
    expect(p.map((x) => x.utilidad.estimado)).toEqual(["10277.30", "13323.98", "16776.28"]);
  });

  it("el crecimiento de ventas no mueve los gastos y el de gastos no mueve las ventas", async () => {
    const base = await periodos(supuestos());
    const soloVentas = await periodos(supuestos({ crecimientoVentasMensual: 20 }));
    const soloGastos = await periodos(supuestos({ crecimientoGastosMensual: 20 }));
    expect(soloVentas.map((x) => x.gastos)).toEqual(base.map((x) => x.gastos));
    expect(soloGastos.map((x) => x.ventas)).toEqual(base.map((x) => x.ventas));
    expect(Number(soloVentas[2]!.ventas.estimado)).toBeGreaterThan(Number(base[2]!.ventas.estimado));
    expect(Number(soloGastos[2]!.gastos.estimado)).toBeGreaterThan(Number(base[2]!.gastos.estimado));
  });

  it("el flujo de efectivo no depende de los supuestos de crecimiento", async () => {
    const base = await periodos(supuestos());
    const con = await periodos(supuestos({ crecimientoVentasMensual: 30, crecimientoGastosMensual: -10 }));
    expect(con.map((x) => x.flujoEfectivo)).toEqual(base.map((x) => x.flujoEfectivo));
  });

  it("el crecimiento de gastos no mueve el IVA proyectado", async () => {
    // En el caso el IVA neto de octubre es cero, así que aquí no se puede comprobar cuánto crece con las ventas
    const base = await periodos(supuestos());
    const gastos = await periodos(supuestos({ crecimientoGastosMensual: 10 }));
    expect(gastos.map((x) => x.iva)).toEqual(base.map((x) => x.iva));
  });

  it("una caída de ventas del 100 % deja ventas en cero y una utilidad igual a menos los gastos", async () => {
    const [primero] = await periodos(supuestos({ meses: 1, crecimientoVentasMensual: -100 }));
    expect(primero!.ventas).toEqual({ estimado: "0.00", minimo: "0.00", maximo: "0.00" });
    expect(primero!.utilidad.estimado).toBe(Dinero.de(primero!.gastos.estimado).por(-1).aTexto());
  });

  it("el número de meses pedido es el de períodos devueltos, hasta el máximo de 24", async () => {
    for (const meses of [1, 12, 24]) {
      const p = await periodos(supuestos({ meses }));
      expect(p, `meses ${meses}`).toHaveLength(meses);
    }
    const ultimo = (await periodos(supuestos({ meses: 24 }))).at(-1)!;
    expect(ultimo.mes).toBe("2028-10-01");
  });

  it("cada cifra queda dentro de su intervalo (mínimo ≤ estimado ≤ máximo) y es una cantidad con 2 decimales", async () => {
    const p = await periodos(
      supuestos({ meses: 6, crecimientoVentasMensual: 3, crecimientoGastosMensual: 2 }),
    );
    for (const periodo of p) {
      for (const valor of [
        periodo.ventas,
        periodo.gastos,
        periodo.utilidad,
        periodo.flujoEfectivo,
        periodo.iva,
      ]) {
        for (const texto of [valor.minimo, valor.estimado, valor.maximo])
          expect(texto).toMatch(/^-?\d+\.\d{2}$/);
        expect(Number(valor.minimo)).toBeLessThanOrEqual(Number(valor.estimado));
        expect(Number(valor.estimado)).toBeLessThanOrEqual(Number(valor.maximo));
      }
    }
  });

  it("los mismos supuestos dan siempre el mismo resultado", async () => {
    const dato = supuestos({ crecimientoVentasMensual: 7.5, crecimientoGastosMensual: 1.25 });
    expect((await proyectar(dato)).cuerpo).toEqual((await proyectar(dato)).cuerpo);
  });
});

describe("la proyección no modifica datos reales", () => {
  it("no cambia ninguna tabla: mismas filas, mismas partidas y mismos detalles antes y después", async () => {
    const antes = await foto();
    for (const dato of [
      supuestos(),
      supuestos({ meses: 24, crecimientoVentasMensual: 1000, crecimientoGastosMensual: -100 }),
      supuestos({ crecimientoVentasMensual: -100 }),
    ]) {
      await proyectar(dato);
    }
    // Las solicitudes rechazadas tampoco escriben nada
    await proyectar(supuestos({ meses: 25 }));
    await proyectar(supuestos(), AUXILIAR);
    await proyectar(supuestos(), SIN_PERMISO);
    expect(await foto()).toEqual(antes);
  });

  it("no crea partidas ni borradores: el número y los estados de partidas del caso siguen igual", async () => {
    const estados = async () =>
      (
        await c.query<{ estado: string; n: string }>(
          "select estado::text, count(*)::text n from partidas group by 1 order by 1",
        )
      ).rows;
    const antes = await estados();
    await proyectar(supuestos({ meses: 12, crecimientoVentasMensual: 5 }));
    expect(await estados()).toEqual(antes);
  });

  it("los estados del caso no cambian: la utilidad de octubre sigue siendo 7,594.99", async () => {
    const utilidad = async () =>
      (
        await fetch(
          `${url}/empresas/${carga.empresaId}/estados/resultados?desde=2026-10-01&hasta=2026-10-31`,
          {
            headers: { authorization: `Bearer ${CONTADOR}` },
          },
        )
      ).json() as Promise<{ utilidadNeta: string; ventas: { total: string } }>;
    const antes = await utilidad();
    await proyectar(supuestos({ crecimientoVentasMensual: 50, crecimientoGastosMensual: 50 }));
    const despues = await utilidad();
    expect(despues).toEqual(antes);
    expect(despues.utilidadNeta).toBe(UTILIDAD_BASE);
  });

  it("una partida en borrador no entra en el historial de la proyección", async () => {
    const antes = (await proyectar(supuestos())).cuerpo;
    const cuentas = await c.query<{ codigo: string; id: string }>(
      `select codigo, id from cuentas where empresa_id = $1 and codigo in ('110101', '510101')`,
      [carga.empresaId],
    );
    const id = (codigo: string) => cuentas.rows.find((k) => k.codigo === codigo)!.id;
    const partida = await c.query<{ id: string }>(
      `insert into partidas (empresa_id, sucursal_id, fecha, tipo, concepto)
       values ($1, $2, '2026-10-20', 'operacion', 'Venta en borrador que no debe proyectarse') returning id`,
      [carga.empresaId, carga.sucursalId],
    );
    await c.query(
      `insert into partida_detalles (partida_id, cuenta_id, debe, haber, orden)
       values ($1, $2, 999, 0, 0), ($1, $3, 0, 999, 1)`,
      [partida.rows[0]!.id, id("110101"), id("510101")],
    );
    expect((await proyectar(supuestos())).cuerpo).toEqual(antes);
  });
});

describe("validación y permisos", () => {
  it("rechaza con 400 meses fuera de 1 a 24 o no enteros, y crecimientos fuera de −100 a 1000", async () => {
    for (const mala of [
      supuestos({ meses: 0 }),
      supuestos({ meses: 25 }),
      supuestos({ meses: 1.5 }),
      supuestos({ meses: "3" }),
      supuestos({ crecimientoVentasMensual: -100.01 }),
      supuestos({ crecimientoVentasMensual: 1000.01 }),
      supuestos({ crecimientoGastosMensual: -101 }),
      supuestos({ crecimientoGastosMensual: "5" }),
      { meses: 3, crecimientoVentasMensual: 0 },
      {},
    ]) {
      expect((await proyectar(mala)).status, JSON.stringify(mala)).toBe(400);
    }
  });

  it("acepta los límites exactos de los supuestos", async () => {
    const r = await proyectar(
      supuestos({ meses: 1, crecimientoVentasMensual: 1000, crecimientoGastosMensual: -100 }),
    );
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.periodos[0]!.gastos.estimado).toBe("0.00");
  });

  it("sin sesión da 401, sin analitica.ver 403 y ajeno a la empresa 404", async () => {
    expect((await proyectar(supuestos(), null)).status).toBe(401);
    expect((await proyectar(supuestos(), SIN_PERMISO)).status).toBe(403);
    expect((await proyectar(supuestos(), AJENO)).status).toBe(404);
  });

  it("quien solo ve una sucursal sin movimientos no tiene historial: 422 y nada se inventa", async () => {
    const r = await proyectar(supuestos(), AUXILIAR);
    expect(r.status).toBe(422);
  });
});
