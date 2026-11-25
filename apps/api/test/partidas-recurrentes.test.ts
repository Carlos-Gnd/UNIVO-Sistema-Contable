// Partidas recurrentes: plantilla desde una partida y borrador del mes sin duplicar (HU-26, S3-T04 y S3-T06).
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { PartidaGeneradaVista, PlantillaRecurrenteVista } from "@contable/shared";
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
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let alquiler: string;
let plantilla: PlantillaRecurrenteVista;

async function usuario(id: string, rol: number, empresa: Escenario) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${rol}`,
    `u${id.slice(0, 4)}@recurrentes.test`,
  ]);
  const m = await c.query(
    `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id`,
    [id, empresa.empresaId, rol, rol <= 2],
  );
  if (rol > 2) {
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0]!.id,
      empresa.sucursalId,
    ]);
  }
}

async function pedir(
  metodo: string,
  ruta: string,
  usuarioId: string | null,
  cuerpo?: unknown,
  empresaId = esc.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresaId}/partidas-recurrentes${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuarioId ? { authorization: `Bearer ${usuarioId}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return {
    status: r.status,
    cuerpo: (await r.json()) as Record<string, unknown> | PlantillaRecurrenteVista[],
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_recurrentes");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-720101-101-1");
  ajena = await crearEscenario(c, "0614-720102-101-2");
  await usuario(CONTADOR, 2, esc);
  await usuario(AUXILIAR, 3, esc);
  await usuario(CONSULTA, 4, esc);
  await usuario(FORASTERO, 2, ajena);
  alquiler = await crearPartida(c, esc, "2026-10-05", [
    [esc.cuentas["110101"]!, "0", "300"],
    [esc.cuentas["5101"]!, "300", "0"],
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

describe("plantilla desde una partida", () => {
  it("copia sucursal, concepto y líneas de la partida", async () => {
    const r = await pedir("POST", "", CONTADOR, { partidaId: alquiler, nombre: "Alquiler" });
    expect(r.status).toBe(201);
    plantilla = r.cuerpo as unknown as PlantillaRecurrenteVista;
    expect(plantilla).toMatchObject({
      nombre: "Alquiler",
      concepto: "Prueba",
      activa: true,
      ultimaGeneracion: null,
    });
    expect(plantilla.lineas.map((l) => [l.cuentaCodigo, l.debe, l.haber])).toEqual([
      ["110101", "0", "300"],
      ["5101", "300", "0"],
    ]);
  });

  it("rechaza nombre repetido (409), partida ajena (404), datos inválidos (400) y tipos no repetibles (422)", async () => {
    expect((await pedir("POST", "", CONTADOR, { partidaId: alquiler, nombre: "Alquiler" })).status).toBe(409);
    const ajenaId = await crearPartida(c, ajena, "2026-10-05", [
      [ajena.cuentas["110101"]!, "0", "10"],
      [ajena.cuentas["5101"]!, "10", "0"],
    ]);
    expect((await pedir("POST", "", CONTADOR, { partidaId: ajenaId, nombre: "Ajena" })).status).toBe(404);
    expect((await pedir("POST", "", CONTADOR, { partidaId: "no-es-uuid", nombre: "X" })).status).toBe(400);
    const cierre = await crearPartida(
      c,
      esc,
      "2026-10-31",
      [
        [esc.cuentas["110101"]!, "0", "5"],
        [esc.cuentas["5101"]!, "5", "0"],
      ],
      "ajuste",
    );
    await c.query("update partidas set tipo = 'cierre' where id = $1", [cierre]);
    expect((await pedir("POST", "", CONTADOR, { partidaId: cierre, nombre: "Cierre" })).status).toBe(422);
  });
});

describe("generar el borrador del mes", () => {
  it("crea un borrador con las líneas de la plantilla, de origen recurrente", async () => {
    const r = await pedir("POST", `/${plantilla.id}/generar`, CONTADOR, { fecha: "2026-11-05" });
    expect(r.status).toBe(201);
    const generada = r.cuerpo as unknown as PartidaGeneradaVista;
    expect(generada).toMatchObject({ fecha: "2026-11-05", estado: "borrador" });
    const fila = (
      await c.query(`select estado, origen, origen_id::text, numero from partidas where id = $1`, [
        generada.partidaId,
      ])
    ).rows[0];
    expect(fila).toMatchObject({
      estado: "borrador",
      origen: "recurrente",
      origen_id: plantilla.id,
      numero: null,
    });
    const detalles = await c.query(
      `select sum(debe)::text as debe, sum(haber)::text as haber from partida_detalles where partida_id = $1`,
      [generada.partidaId],
    );
    expect(detalles.rows[0]).toEqual({ debe: "300.00", haber: "300.00" });
  });

  it("no duplica la partida del mismo mes (409), pero sí genera otro mes", async () => {
    expect((await pedir("POST", `/${plantilla.id}/generar`, CONTADOR, { fecha: "2026-11-25" })).status).toBe(
      409,
    );
    expect((await pedir("POST", `/${plantilla.id}/generar`, CONTADOR, { fecha: "2026-12-05" })).status).toBe(
      201,
    );
    const lista = (await pedir("GET", "", CONTADOR)).cuerpo as PlantillaRecurrenteVista[];
    expect(lista[0]!.ultimaGeneracion).toMatchObject({ fecha: "2026-12-05", estado: "borrador" });
  });

  it("dos solicitudes simultáneas generan una sola partida", async () => {
    const r = await pedir("POST", "", CONTADOR, { partidaId: alquiler, nombre: "Internet" });
    const id = (r.cuerpo as unknown as PlantillaRecurrenteVista).id;
    const resultados = await Promise.all([
      pedir("POST", `/${id}/generar`, CONTADOR, { fecha: "2026-11-10" }),
      pedir("POST", `/${id}/generar`, CONTADOR, { fecha: "2026-11-11" }),
    ]);
    expect(resultados.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it("una anulada permite volver a generar el mes", async () => {
    const r = await pedir("POST", "", CONTADOR, { partidaId: alquiler, nombre: "Luz" });
    const id = (r.cuerpo as unknown as PlantillaRecurrenteVista).id;
    const g = (await pedir("POST", `/${id}/generar`, CONTADOR, { fecha: "2026-11-05" }))
      .cuerpo as unknown as PartidaGeneradaVista;
    await contabilizar(c, g.partidaId);
    await c.query(`update partidas set estado = 'anulada', motivo_anulacion = 'Prueba' where id = $1`, [
      g.partidaId,
    ]);
    expect((await pedir("POST", `/${id}/generar`, CONTADOR, { fecha: "2026-11-06" })).status).toBe(201);
  });

  it("una plantilla inactiva no genera (422)", async () => {
    const e = await pedir("PATCH", `/${plantilla.id}`, CONTADOR, { activa: false });
    expect(e.status).toBe(200);
    expect((await pedir("POST", `/${plantilla.id}/generar`, CONTADOR, { fecha: "2027-01-05" })).status).toBe(
      422,
    );
    expect((await pedir("PATCH", `/${plantilla.id}`, CONTADOR, {})).status).toBe(400);
  });
});

describe("permisos y aislamiento", () => {
  it("la consulta lista pero no registra; un forastero recibe 404", async () => {
    expect((await pedir("GET", "", CONSULTA)).status).toBe(200);
    expect((await pedir("POST", "", CONSULTA, { partidaId: alquiler, nombre: "No" })).status).toBe(403);
    expect((await pedir("GET", "", FORASTERO)).status).toBe(404);
    expect((await pedir("POST", `/${plantilla.id}/generar`, FORASTERO, { fecha: "2027-02-05" })).status).toBe(
      404,
    );
    expect((await pedir("GET", "", null)).status).toBe(401);
  });

  it("deja la creación en la bitácora a nombre de quien la hizo", async () => {
    const f = await c.query(
      `select usuario_id::text as usuario from bitacora where tabla = 'plantillas_recurrentes' and accion = 'INSERT' and registro_id = $1`,
      [plantilla.id],
    );
    expect(f.rows[0]).toEqual({ usuario: CONTADOR });
  });
});

describe("selector de partidas y generación del mes completo", () => {
  it("lista las partidas utilizables como modelo, sin anuladas ni de otra empresa", async () => {
    const r = await pedir("GET", "/partidas-disponibles", CONTADOR);
    expect(r.status).toBe(200);
    const lista = r.cuerpo as unknown as { id: string; total: string; estado: string }[];
    expect(lista.map((p) => p.id)).toContain(alquiler);
    expect(lista.find((p) => p.id === alquiler)).toMatchObject({ total: "300.00", estado: "borrador" });
    expect((await pedir("GET", "/partidas-disponibles", FORASTERO)).status).toBe(404);
    expect((await pedir("GET", "/partidas-disponibles", null)).status).toBe(401);
  });

  it("genera el borrador del mes de todas las plantillas activas y omite las que ya lo tienen", async () => {
    const crear = async (nombre: string) =>
      (
        (await pedir("POST", "", CONTADOR, { partidaId: alquiler, nombre }))
          .cuerpo as unknown as PlantillaRecurrenteVista
      ).id;
    const a = await crear("Mes A");
    const b = await crear("Mes B");
    const inactiva = await crear("Mes inactiva");
    await pedir("PATCH", `/${inactiva}`, CONTADOR, { activa: false });
    expect((await pedir("POST", `/${b}/generar`, CONTADOR, { fecha: "2026-09-02" })).status).toBe(201);

    const r = await pedir("POST", "/generar-mes", CONTADOR, { fecha: "2026-09-15" });
    expect(r.status).toBe(201);
    const resultado = r.cuerpo as unknown as {
      generadas: { plantillaId: string }[];
      omitidas: { plantillaId: string; motivo: string }[];
    };
    expect(resultado.generadas.map((g) => g.plantillaId)).toContain(a);
    expect(resultado.generadas.map((g) => g.plantillaId)).not.toContain(inactiva);
    expect(resultado.omitidas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plantillaId: b, motivo: expect.stringMatching(/vigente/) }),
      ]),
    );
    // Repetir no duplica nada: ahora todas están omitidas
    const otra = (await pedir("POST", "/generar-mes", CONTADOR, { fecha: "2026-09-20" }))
      .cuerpo as unknown as {
      generadas: unknown[];
    };
    expect(otra.generadas).toEqual([]);
    const total = await c.query(
      `select count(*)::int as n from partidas where origen = 'recurrente' and origen_id = $1 and fecha >= '2026-09-01' and fecha < '2026-10-01'`,
      [a],
    );
    expect(total.rows[0].n).toBe(1);
  });

  it("quien solo consulta no puede generar el mes (403)", async () => {
    expect((await pedir("POST", "/generar-mes", CONSULTA, { fecha: "2027-05-01" })).status).toBe(403);
    expect((await pedir("POST", "/generar-mes", CONTADOR, { fecha: "no-es-fecha" })).status).toBe(400);
  });
});
