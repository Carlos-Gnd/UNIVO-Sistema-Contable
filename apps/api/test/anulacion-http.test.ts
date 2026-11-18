// Anulación por reversión por HTTP (HU-24, S2-T12): POST /empresas/:empresaId/partidas/:partidaId/anular.
// El caso de uso ya se prueba contra la base en anulacion.test.ts (S2-T14); aquí, el endpoint: el motivo
// obligatorio, el permiso de contador y la traducción de cada error a su código HTTP.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
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

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_anulacion_http");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  const otra = await crearEscenario(c, "1234-567890-123-0");

  const usuarios: [string, string, number][] = [
    [CONTADOR, esc.empresaId, 2],
    [AUXILIAR, esc.empresaId, 3],
    [CONSULTA, esc.empresaId, 4],
    [AJENO, otra.empresaId, 2],
  ];
  for (const [id, empresaId, rol] of usuarios) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Usuario ${rol}`,
      `${id}@prueba.sv`,
    ]);
    // El auxiliar y el de consulta trabajan con sucursales asignadas (no pueden tenerlas todas)
    const todas = rol <= 2;
    const m = await c.query<{ id: string }>(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
      [id, empresaId, rol, todas],
    );
    if (!todas) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        m.rows[0]!.id,
        esc.sucursalId,
      ]);
    }
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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

async function anular(partidaId: string, usuario: string, cuerpo: unknown, empresaId = esc.empresaId) {
  const r = await fetch(`${url}/empresas/${empresaId}/partidas/${partidaId}/anular`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

/** Partida en borrador o contabilizada; devuelve su id. */
async function partida(contabilizada = true, fecha = "2026-11-10"): Promise<string> {
  const id = await crearPartida(c, esc, fecha, [
    [esc.cuentas["110101"]!, "25.50", "0"],
    [esc.cuentas["5101"]!, "0", "25.50"],
  ]);
  if (contabilizada) await contabilizar(c, id);
  return id;
}

const estado = async (id: string) =>
  (await c.query("select estado, motivo_anulacion from partidas where id = $1", [id])).rows[0];

describe("POST …/partidas/:partidaId/anular (S2-T12)", () => {
  it("el contador anula con motivo: 200 con la original anulada y la reversión contabilizada", async () => {
    const id = await partida();
    const r = await anular(id, CONTADOR, { motivo: "  Venta registrada dos veces  ", fecha: "2026-11-12" });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({
      original: { id, numero: expect.any(Number), ambito: expect.any(String) },
      reversion: {
        id: expect.any(String),
        fecha: "2026-11-12",
        numero: expect.any(Number),
        ambito: expect.any(String),
      },
    });
    expect(await estado(id)).toEqual({ estado: "anulada", motivo_anulacion: "Venta registrada dos veces" });
    const reversion = await c.query("select tipo, estado, partida_revertida_id from partidas where id = $1", [
      (r.cuerpo["reversion"] as { id: string }).id,
    ]);
    expect(reversion.rows[0]).toEqual({
      tipo: "reversion",
      estado: "contabilizada",
      partida_revertida_id: id,
    });
  });

  it("el motivo es obligatorio: 400 sin motivo, con motivo vacío o demasiado largo, y no anula", async () => {
    const id = await partida();
    for (const cuerpo of [{}, { motivo: "   " }, { motivo: "x".repeat(501) }]) {
      const r = await anular(id, CONTADOR, cuerpo);
      expect(r.status).toBe(400);
      expect(Object.keys(r.cuerpo["errores"] as object)).toEqual(["motivo"]);
    }
    expect((await estado(id)).estado).toBe("contabilizada");
  });

  it("rechaza fechas mal escritas y campos desconocidos: 400", async () => {
    const id = await partida();
    expect((await anular(id, CONTADOR, { motivo: "Error", fecha: "12/11/2026" })).status).toBe(400);
    expect((await anular(id, CONTADOR, { motivo: "Error", estado: "anulada" })).status).toBe(400);
  });

  it("solo con permiso de contador: el auxiliar y el de consulta reciben 403 y la partida queda intacta", async () => {
    const id = await partida();
    expect((await anular(id, AUXILIAR, { motivo: "Error" })).status).toBe(403);
    expect((await anular(id, CONSULTA, { motivo: "Error" })).status).toBe(403);
    expect((await estado(id)).estado).toBe("contabilizada");
  });

  it("404 si la partida no existe o es de otra empresa", async () => {
    const id = await partida();
    expect((await anular("99999999-9999-4999-8999-999999999999", CONTADOR, { motivo: "Error" })).status).toBe(
      404,
    );
    // Un usuario de otra empresa no ve la empresa
    expect((await anular(id, AJENO, { motivo: "Error" })).status).toBe(404);
  });

  it("409 si la partida es un borrador, ya está anulada o es una reversión", async () => {
    const borrador = await partida(false);
    const b = await anular(borrador, CONTADOR, { motivo: "Error" });
    expect(b.status).toBe(409);
    expect(b.cuerpo["message"]).toMatch(/borrador/);

    const id = await partida();
    const primera = await anular(id, CONTADOR, { motivo: "Error" });
    const otraVez = await anular(id, CONTADOR, { motivo: "Error" });
    expect(otraVez.status).toBe(409);
    expect(otraVez.cuerpo["message"]).toMatch(/ya está anulada/);

    const reversionId = (primera.cuerpo["reversion"] as { id: string }).id;
    expect((await anular(reversionId, CONTADOR, { motivo: "Error" })).status).toBe(409);
  });

  it("422 si la fecha de la reversión es anterior a la de la partida", async () => {
    const id = await partida(true, "2026-11-10");
    const r = await anular(id, CONTADOR, { motivo: "Error", fecha: "2026-11-09" });
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/2026-11-10/);
    expect((await estado(id)).estado).toBe("contabilizada");
  });
});
