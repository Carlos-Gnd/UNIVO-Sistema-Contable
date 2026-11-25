// Depreciación mensual automática (HU-82, S3-T132): con el caso CheroPhonex, el mobiliario y equipo de
// US$ 2,500 (50 % anual, Art. 30 LISR) se deprecia US$ 104.17 al mes y la partida de ajuste coincide al centavo
// con la del ejercicio de clase.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  Balanza,
  CuadroActivo,
  ResultadoAltaActivo,
  ResultadoDepreciacion,
  VistaDepreciacionMes,
} from "@contable/shared";
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
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const CONSULTA = "44444444-4444-4444-8444-444444444444";

const caso = leerCaso();
const esperado = caso.esperado;

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;
let afMobiliario: string;
let afUsulutan: string;

async function llamar<T>(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const vista = (mes: string, usuario?: string) =>
  llamar<VistaDepreciacionMes>("GET", `/depreciacion?mes=${mes}`, undefined, usuario);
const generar = (mes: string, usuario?: string) =>
  llamar<ResultadoDepreciacion>("POST", "/depreciacion", { mes }, usuario);

async function lineasDe(partidaId: string) {
  const r = await c.query<{ codigo: string; debe: string; haber: string }>(
    `select c.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas c on c.id = d.cuenta_id
     where d.partida_id = $1 order by d.orden`,
    [partidaId],
  );
  return r.rows;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_depreciacion");
  c = await reiniciarBase(urlBase);
  // El caso trae su propia partida de depreciación (n.º 37): se omite para que la genere el sistema y se compare
  const sinDepreciacion = {
    ...caso,
    partidas: caso.partidas.filter((p) => !/depreciación/i.test(p.concepto) || p.tipo !== "ajuste"),
  };
  expect(sinDepreciacion.partidas).toHaveLength(caso.partidas.length - 1);
  carga = await cargarCasoCherophonex(c, sinDepreciacion);
  const s = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S002') returning id`,
    [carga.empresaId],
  );
  sucursalNueva = s.rows[0]!.id;
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [CONSULTA, "Consulta"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase()}@prueba.sv`,
    ]);
  }
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );
  for (const [usuario, rol] of [
    [AUXILIAR, 3],
    [CONSULTA, 4],
  ] as const) {
    const m = await c.query<{ id: string }>(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, false) returning id",
      [usuario, carga.empresaId, rol],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2), ($1, $3)", [
      m.rows[0]!.id,
      carga.sucursalId,
      sucursalNueva,
    ]);
  }

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

  // El mobiliario y equipo ya está en la apertura (partida n.º 1): se registra sin partida de adquisición
  const alta = await llamar<ResultadoAltaActivo>("POST", "/activos-fijos", {
    nombre: "Mobiliario y equipo de CheroPhonex",
    categoria: "mobiliario_equipo",
    sucursalId: carga.sucursalId,
    costo: "2500.00",
    fechaAdquisicion: "2026-10-01",
    vidaUtilAnios: 2,
  });
  expect(alta.status).toBe(201);
  afMobiliario = alta.cuerpo.activo.id;
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("depreciación de octubre de 2026 (S3-T130 y S3-T132)", () => {
  it("la vista previa calcula US$ 104.17 y la partida de ajuste por generar", async () => {
    const r = await vista("2026-10");
    expect(r.status).toBe(200);
    expect(r.cuerpo.activos).toHaveLength(1);
    expect(r.cuerpo.activos[0]).toMatchObject({
      codigo: "AF-0001",
      cuota: "104.17",
      acumulada: "104.17",
      valorEnLibros: "2395.83",
      estado: "pendiente",
      tasaAnual: "50.00",
    });
    expect(r.cuerpo.totalPendiente).toBe("104.17");
    expect(r.cuerpo.partidas).toHaveLength(1);
    expect(r.cuerpo.partidas[0]?.fecha).toBe("2026-10-31");
    expect(r.cuerpo.partidas[0]?.lineas.map((l) => [l.codigo, l.debe, l.haber])).toEqual([
      ["420122", "104.17", "0.00"],
      ["120204", "0.00", "104.17"],
    ]);
  });

  it("al generar crea una partida de ajuste contabilizada con el gasto y la depreciación acumulada", async () => {
    const r = await generar("2026-10");
    expect(r.status).toBe(201);
    expect(r.cuerpo.total).toBe("104.17");
    expect(r.cuerpo.partidas).toHaveLength(1);
    const id = r.cuerpo.partidas[0]!.partida.id;
    expect(await lineasDe(id)).toEqual([
      { codigo: "420122", debe: "104.17", haber: "0.00" },
      { codigo: "120204", debe: "0.00", haber: "104.17" },
    ]);
    const p = await c.query(`select tipo, estado, origen, fecha::text from partidas where id = $1`, [id]);
    expect(p.rows[0]).toMatchObject({
      tipo: "ajuste",
      estado: "contabilizada",
      origen: "depreciacion",
      fecha: "2026-10-31",
    });
  });

  it("la balanza ajustada coincide al centavo con la del ejercicio de clase en las cuentas de depreciación", async () => {
    const r = await llamar<Balanza>("GET", "/balanzas/ajustada?desde=2026-10-01&hasta=2026-10-31");
    expect(r.status).toBe(200);
    const ajustada = esperado.balanzas.ajustada;
    for (const codigo of ["420122", "120204"]) {
      const l = r.cuerpo.lineas.find((x) => x.codigo === codigo)!;
      const e = ajustada.cuentas[codigo]!;
      expect(l.movimientoDebe, codigo).toBe(Number(e.debe).toFixed(2));
      expect(l.movimientoHaber, codigo).toBe(Number(e.haber).toFixed(2));
    }
    expect(r.cuerpo.totales.movimientoDebe).toBe(ajustada.totales.debe);
    expect(r.cuerpo.cuadra).toBe(true);
  });

  it("no se deprecia dos veces el mismo mes (409) y la vista lo marca como generado", async () => {
    expect((await generar("2026-10")).status).toBe(409);
    const r = await vista("2026-10");
    expect(r.cuerpo.activos[0]?.estado).toBe("generada");
    expect(r.cuerpo.partidas).toEqual([]);
    expect(r.cuerpo.totalPendiente).toBe("0.00");
  });
});

describe("noviembre: dos sucursales y meses en orden", () => {
  beforeAll(async () => {
    const r = await llamar<ResultadoAltaActivo>("POST", "/activos-fijos", {
      nombre: "Aire acondicionado Usulután",
      categoria: "mobiliario_equipo",
      sucursalId: sucursalNueva,
      costo: "1200.00",
      fechaAdquisicion: "2026-11-05",
      vidaUtilAnios: 3,
    });
    afUsulutan = r.cuerpo.activo.id;
  });

  it("genera una partida por sucursal: US$ 104.17 en la matriz y US$ 33.33 en Usulután", async () => {
    const r = await generar("2026-11");
    expect(r.status).toBe(201);
    expect(r.cuerpo.partidas).toHaveLength(2);
    expect(r.cuerpo.total).toBe("137.50");
    const porSucursal = Object.fromEntries(r.cuerpo.partidas.map((p) => [p.sucursalId, p.total]));
    expect(porSucursal).toEqual({ [carga.sucursalId]: "104.17", [sucursalNueva]: "33.33" });
    const filas = await c.query<{ codigo: string; acumulada: string; ultimo: string }>(
      `select codigo, depreciacion_acumulada::text as acumulada, ultimo_mes_depreciado::text as ultimo
       from activos_fijos order by codigo`,
    );
    expect(filas.rows).toEqual([
      { codigo: "AF-0001", acumulada: "208.34", ultimo: "2026-11-01" },
      { codigo: "AF-0002", acumulada: "33.33", ultimo: "2026-11-01" },
    ]);
  });

  it("no se salta meses: febrero de 2027 sin enero ni diciembre es un conflicto (409)", async () => {
    const r = await generar("2027-02");
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.cuerpo)).toContain("diciembre de 2026");
    expect((await vista("2027-02")).cuerpo.activos.every((a) => a.estado === "bloqueada")).toBe(true);
  });

  it("si el período está cerrado la partida se rechaza (422) y no queda ninguna cuota registrada", async () => {
    await c.query(
      `update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 12 and ejercicio_id in (select id from ejercicios where empresa_id = $1 and anio = 2026)`,
      [carga.empresaId],
    );
    const antes = await c.query<{ n: string }>("select count(*)::text as n from depreciaciones");
    expect((await generar("2026-12")).status).toBe(422);
    const despues = await c.query<{ n: string }>("select count(*)::text as n from depreciaciones");
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);
  });

  it("el cuadro del activo trae los 24 meses; el último absorbe el redondeo y deja el valor en libros en cero", async () => {
    const r = await llamar<CuadroActivo>("GET", `/activos-fijos/${afMobiliario}/cuadro`);
    expect(r.status).toBe(200);
    expect(r.cuerpo.filas).toHaveLength(24);
    expect(r.cuerpo.filas.slice(0, 3).map((f) => [f.mes, f.cuota, f.estado])).toEqual([
      ["2026-10-01", "104.17", "generada"],
      ["2026-11-01", "104.17", "generada"],
      ["2026-12-01", "104.17", "pendiente"],
    ]);
    expect(r.cuerpo.filas.at(-1)).toMatchObject({
      mes: "2028-09-01",
      cuota: "104.09",
      acumulada: "2500.00",
      valorEnLibros: "0.00",
    });
    expect(r.cuerpo.filas[0]?.partidaId).toBeTruthy();
  });

  it("solo quien tiene ajustes.generar genera (el auxiliar y la consulta reciben 403); la consulta sí ve", async () => {
    expect((await generar("2026-12", AUXILIAR)).status).toBe(403);
    expect((await generar("2026-12", CONSULTA)).status).toBe(403);
    expect((await vista("2026-11", CONSULTA)).status).toBe(200);
  });

  it("rechaza un mes con formato inválido (400)", async () => {
    expect((await vista("11/2026")).status).toBe(400);
    expect((await generar("2026-13")).status).toBe(400);
  });

  it("un activo dado de baja deja de depreciarse", async () => {
    const baja = await llamar("POST", `/activos-fijos/${afUsulutan}/baja`, { fecha: "2026-11-20" });
    expect(baja.status).toBe(200);
    const r = await vista("2026-11");
    expect(r.cuerpo.activos.map((a) => a.codigo)).toEqual(["AF-0001"]);
  });
});
