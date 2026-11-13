// Consulta de la bitácora (HU-11, S1-T58) de punta a punta: HTTP → caso de uso → PostgreSQL.
// Usa una base propia (contable_api_bitacora) para correr en paralelo con las demás pruebas.
import type { PaginaBitacora } from "@contable/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearPartida, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const ADMIN = "a1111111-1111-4111-8111-111111111111";
const CONTADOR = "b2222222-2222-4222-8222-222222222222";
const AUXILIAR = "c3333333-3333-4333-8333-333333333333";
const CONSULTA = "d4444444-4444-4444-8444-444444444444";
const AJENO = "e5555555-5555-4555-8555-555555555555";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;
let otraEmpresaId: string;
let matrizId: string;
let surId: string;
/** Partidas de cada sucursal, para comprobar qué ve quien está limitado a la casa matriz */
const partidasDe: Record<"matriz" | "sur", string[]> = { matriz: [], sur: [] };

async function pedir(metodo: string, ruta: string, usuario: string, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

async function bitacora(filtros: Record<string, string> = {}, usuario = ADMIN, empresa = empresaId) {
  const q = new URLSearchParams(filtros).toString();
  const r = await pedir("GET", `/empresas/${empresa}/bitacora${q ? `?${q}` : ""}`, usuario);
  return {
    status: r.status,
    cuerpo: r.cuerpo as unknown as PaginaBitacora & { errores?: Record<string, string[]> },
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_bitacora");
  c = await reiniciarBase(urlBase);
  for (const [id, nombre] of [
    [ADMIN, "Ana"],
    [CONTADOR, "Beto"],
    [AUXILIAR, "Carla"],
    [CONSULTA, "Dora"],
    [AJENO, "Ernesto"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase()}@prueba.sv`,
    ]);
  }

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();

  // Cambios reales por la API: registrar la empresa (con su matriz y catálogo) y editarla
  empresaId = (
    await pedir("POST", "/empresas", ADMIN, {
      nombre: "Comercial Oriente, S.A. de C.V.",
      nit: "0614-010190-101-5",
      tipoContribuyente: "sociedad",
    })
  ).cuerpo["id"] as string;
  await pedir("PATCH", `/empresas/${empresaId}`, ADMIN, { telefono: "2661-0000" });

  const matriz = (await c.query("select id from sucursales where empresa_id = $1 and es_matriz", [empresaId]))
    .rows[0].id as string;
  matrizId = matriz;

  // Segunda sucursal y partidas con sus líneas en cada una (el auxiliar y consulta solo tienen la matriz)
  surId = (
    await pedir("POST", `/empresas/${empresaId}/sucursales`, ADMIN, {
      nombre: "Sucursal Usulután",
      codigoEstablecimiento: "S001",
    })
  ).cuerpo["id"] as string;
  await c.query(
    "insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')",
    [empresaId],
  );
  const cuentas = Object.fromEntries(
    (
      await c.query("select codigo, id from cuentas where empresa_id = $1 and codigo in ('110101', '5101')", [
        empresaId,
      ])
    ).rows.map((f) => [f.codigo, f.id]),
  );
  for (const [donde, sucursalId] of [
    ["matriz", matriz],
    ["sur", surId],
  ] as const) {
    for (const fecha of ["2026-10-10", "2026-10-11"]) {
      const id = await crearPartida(c, { empresaId, sucursalId, cuentas }, fecha, [
        [cuentas["110101"]!, "50.00", "0"],
        [cuentas["5101"]!, "0", "50.00"],
      ]);
      partidasDe[donde].push(id);
    }
  }
  // Una edición en cada sucursal, para que haya UPDATE de partidas y de líneas
  for (const donde of ["matriz", "sur"] as const) {
    await c.query("update partidas set concepto = 'Corregido' where id = $1", [partidasDe[donde][0]]);
    await c.query("update partida_detalles set concepto = 'Corregido' where partida_id = $1", [
      partidasDe[donde][0],
    ]);
  }
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresaId],
  );
  for (const [usuario, rol] of [
    [AUXILIAR, 3],
    [CONSULTA, 4],
  ] as const) {
    const m = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, false) returning id",
      [usuario, empresaId, rol],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0].id,
      matriz,
    ]);
  }

  // El contador crea una sucursal en su propia empresa: no debe aparecer en la bitácora de la primera
  otraEmpresaId = (
    await pedir("POST", "/empresas", CONTADOR, {
      nombre: "Ferretería del Contador",
      nit: "1234-567890-123-0",
      tipoContribuyente: "sociedad",
    })
  ).cuerpo["id"] as string;

  // Cambios con fecha conocida (la bitácora admite INSERT; se fija creado_en para probar los filtros):
  // el 31/10 a las 23:30 en El Salvador ya es 1/11 en UTC
  await c.query(
    `insert into bitacora (empresa_id, usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos, creado_en)
     values ($1, $2, 'partidas', 'p-1', 'DELETE', '{"concepto":"Borrador viejo"}', null, '2026-11-01T05:30:00Z'),
            ($1, $2, 'cuentas', 'k-1', 'UPDATE', '{"nombre":"Caja"}', '{"nombre":"Caja general"}', '2026-11-01T06:30:00Z'),
            ($1, null, 'periodos', 'per-1', 'UPDATE', '{"estado":"abierto"}', '{"estado":"cerrado"}', '2026-11-05T18:00:00Z')`,
    [empresaId, CONTADOR],
  );
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/:empresa/bitacora", () => {
  it("muestra usuario, fecha, acción, registro y valores anteriores y nuevos, del más reciente al más antiguo", async () => {
    const r = await bitacora({ modulo: "organizacion", accion: "UPDATE" });
    expect(r.status).toBe(200);
    const [edicion] = r.cuerpo.registros;
    expect(edicion).toMatchObject({
      usuario: { id: ADMIN, nombre: "Ana", correo: "ana@prueba.sv" },
      modulo: "organizacion",
      tabla: "empresas",
      accion: "UPDATE",
      registroId: empresaId,
      datosAnteriores: expect.objectContaining({ telefono: null }),
      datosNuevos: expect.objectContaining({ telefono: "2661-0000" }),
    });
    expect(new Date(edicion!.fecha).toString()).not.toBe("Invalid Date");

    const fechas = (await bitacora()).cuerpo.registros.map((e) => e.fecha);
    expect(fechas).toEqual([...fechas].sort().reverse());
  });

  it("solo incluye los cambios de la empresa consultada", async () => {
    const r = await bitacora({ porPagina: "100" });
    expect(r.cuerpo.total).toBeGreaterThan(165); // el catálogo copiado deja una creación por cuenta
    const ajenos = await c.query("select count(*)::int as n from bitacora where empresa_id = $1", [
      otraEmpresaId,
    ]);
    expect(ajenos.rows[0].n).toBeGreaterThan(0);
    const propios = await c.query("select count(*)::int as n from bitacora where empresa_id = $1", [
      empresaId,
    ]);
    expect(r.cuerpo.total).toBe(propios.rows[0].n);
  });

  it("filtra por usuario", async () => {
    const r = await bitacora({ usuarioId: CONTADOR });
    expect(r.cuerpo.registros.map((e) => e.registroId).sort()).toEqual(["k-1", "p-1"]);
    expect(r.cuerpo.registros.every((e) => e.usuario?.id === CONTADOR)).toBe(true);
  });

  it("filtra por módulo y acción", async () => {
    const catalogo = await bitacora({ modulo: "catalogo", accion: "UPDATE" });
    expect(catalogo.cuerpo.registros.map((e) => e.registroId)).toEqual(["k-1"]);

    const eliminaciones = await bitacora({ accion: "DELETE" });
    expect(eliminaciones.cuerpo.registros).toEqual([
      expect.objectContaining({ registroId: "p-1", modulo: "contabilidad", datosNuevos: null }),
    ]);
  });

  it("filtra por rango de fechas en hora de El Salvador, con el día final completo", async () => {
    // 2026-11-01T05:30Z es el 31/10 a las 23:30 en El Salvador: cae en octubre
    const octubre = await bitacora({ desde: "2026-10-31", hasta: "2026-10-31" });
    expect(octubre.cuerpo.registros.map((e) => e.registroId)).toEqual(["p-1"]);

    const noviembre = await bitacora({ desde: "2026-11-01", hasta: "2026-11-05" });
    expect(noviembre.cuerpo.registros.map((e) => e.registroId)).toEqual(["per-1", "k-1"]);

    const soloDesde = await bitacora({ desde: "2026-11-02", modulo: "contabilidad", porPagina: "100" });
    expect(soloDesde.cuerpo.registros.map((e) => e.registroId)).toContain("per-1");
    expect(soloDesde.cuerpo.registros.map((e) => e.registroId)).not.toContain("p-1");
  });

  it("muestra los cambios hechos fuera de la API sin usuario", async () => {
    const r = await bitacora({ desde: "2026-11-05", hasta: "2026-11-05" });
    expect(r.cuerpo.registros).toEqual([expect.objectContaining({ registroId: "per-1", usuario: null })]);
  });

  it("pagina los resultados sin repetir ni saltar registros", async () => {
    const total = (await bitacora({ modulo: "catalogo" })).cuerpo.total;
    const p1 = await bitacora({ modulo: "catalogo", porPagina: "100", pagina: "1" });
    const p2 = await bitacora({ modulo: "catalogo", porPagina: "100", pagina: "2" });
    expect(p1.cuerpo).toMatchObject({ pagina: 1, porPagina: 100, total, paginas: Math.ceil(total / 100) });
    expect(p1.cuerpo.registros).toHaveLength(100);
    expect(p2.cuerpo.registros).toHaveLength(total - 100);
    const ids = [...p1.cuerpo.registros, ...p2.cuerpo.registros].map((e) => e.id);
    expect(new Set(ids).size).toBe(total);

    const despues = await bitacora({ modulo: "catalogo", porPagina: "100", pagina: "9" });
    expect(despues.cuerpo.registros).toEqual([]);
  });

  it("responde 400 con filtros inválidos", async () => {
    const r = await bitacora({ porPagina: "1000", modulo: "planilla", accion: "TRUNCATE" });
    expect(r.status).toBe(400);
    expect(Object.keys(r.cuerpo.errores ?? {}).sort()).toEqual(["accion", "modulo", "porPagina"]);

    const fechas = await bitacora({ desde: "2026-11-13", hasta: "2026-11-01" });
    expect(fechas.status).toBe(400);
    expect(fechas.cuerpo.errores).toEqual({ hasta: ["La fecha inicial no puede ser posterior a la final."] });
  });

  it("administrador, contador y consulta la ven; el auxiliar no (bitacora.ver)", async () => {
    expect((await bitacora({}, ADMIN)).status).toBe(200);
    expect((await bitacora({}, CONTADOR)).status).toBe(200);
    expect((await bitacora({}, CONSULTA)).status).toBe(200);
    expect((await bitacora({}, AUXILIAR)).status).toBe(403);
  });

  it("un usuario ajeno a la empresa recibe 404, y sin token 401", async () => {
    expect((await bitacora({}, AJENO)).status).toBe(404);
    expect((await fetch(`${url}/empresas/${empresaId}/bitacora`)).status).toBe(401);
  });
});

/** Todas las páginas de la bitácora que ve el usuario, comprobando que el total cuadra con lo que recibe. */
async function todo(usuario: string, filtros: Record<string, string> = {}) {
  const pagina = (n: number) =>
    bitacora({ ...filtros, porPagina: "100", pagina: String(n) }, usuario).then((r) => {
      expect(r.status).toBe(200);
      return r.cuerpo;
    });
  const primera = await pagina(1);
  const registros = [...primera.registros];
  for (let n = 2; n <= primera.paginas; n++) registros.push(...(await pagina(n)).registros);
  expect(registros).toHaveLength(primera.total);
  return registros;
}

const sucursalDe = (e: PaginaBitacora["registros"][number]) =>
  (e.datosNuevos?.["sucursal_id"] ?? e.datosAnteriores?.["sucursal_id"]) as string | undefined;
const partidaDe = (e: PaginaBitacora["registros"][number]) =>
  (e.datosNuevos?.["partida_id"] ?? e.datosAnteriores?.["partida_id"]) as string | undefined;

describe("límite por sucursal (HU-08)", () => {
  it("consulta, asignado a la casa matriz, ve las partidas y líneas de la matriz y el catálogo", async () => {
    const vistos = await todo(CONSULTA);
    const partidas = vistos.filter((e) => e.tabla === "partidas");
    const lineas = vistos.filter((e) => e.tabla === "partida_detalles");

    expect(new Set(partidas.map((e) => e.registroId))).toEqual(new Set(partidasDe.matriz));
    expect(partidas.some((e) => e.accion === "UPDATE")).toBe(true);
    expect(new Set(lineas.map(partidaDe))).toEqual(new Set(partidasDe.matriz));
    expect(lineas.some((e) => e.accion === "UPDATE")).toBe(true);
    expect(vistos.filter((e) => e.tabla === "cuentas").length).toBeGreaterThanOrEqual(165);
    expect(vistos.some((e) => e.tabla === "empresas")).toBe(true);
  });

  it("no ve los cambios de otra sucursal ni los de membresías", async () => {
    const vistos = await todo(CONSULTA);
    expect(vistos.filter((e) => e.tabla === "partidas").every((e) => sucursalDe(e) === matrizId)).toBe(true);
    expect(vistos.some((e) => partidasDe.sur.includes(e.registroId ?? ""))).toBe(false);
    expect(vistos.some((e) => partidasDe.sur.includes(partidaDe(e) ?? ""))).toBe(false);
    expect(vistos.filter((e) => e.tabla === "sucursales").map((e) => e.registroId)).not.toContain(surId);
    expect(vistos.some((e) => e.tabla === "membresias" || e.tabla === "membresia_sucursales")).toBe(false);

    const usuarios = await bitacora({ modulo: "usuarios" }, CONSULTA);
    expect(usuarios.cuerpo).toMatchObject({ total: 0, registros: [] });
  });

  it("administrador y contador ven todas las sucursales y las membresías", async () => {
    const admin = await todo(ADMIN);
    const contador = await todo(CONTADOR);
    expect(contador.map((e) => e.id)).toEqual(admin.map((e) => e.id));
    expect(admin.filter((e) => e.tabla === "partidas").map(sucursalDe)).toContain(surId);
    expect(admin.some((e) => partidasDe.sur.includes(partidaDe(e) ?? ""))).toBe(true);
    expect(admin.some((e) => e.tabla === "membresias")).toBe(true);

    const consulta = await todo(CONSULTA);
    expect(consulta.length).toBeLessThan(admin.length);
  });

  it("los filtros y la paginación se combinan con el límite", async () => {
    const r = await bitacora({ modulo: "contabilidad", accion: "UPDATE", porPagina: "1" }, CONSULTA);
    const actualizaciones = (await todo(CONSULTA, { modulo: "contabilidad", accion: "UPDATE" })).length;
    expect(r.cuerpo).toMatchObject({ total: actualizaciones, paginas: actualizaciones });
    expect(r.cuerpo.registros).toHaveLength(1);
  });
});
