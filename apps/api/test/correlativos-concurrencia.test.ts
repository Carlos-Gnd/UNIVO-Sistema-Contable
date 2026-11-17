// Prueba de concurrencia de correlativos a través de la API (S1-T87, HU-22): varios usuarios contabilizan
// a la vez, por partida y por lote, con lotes que se traslapan.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ResultadoContabilizacion } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  crearEscenario,
  crearPartida,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id del usuario>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const CONTADORES = [
  "11111111-1111-4111-8111-111111111111",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];
const [CONTADOR] = CONTADORES as [string];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let nits = 0;

async function post<T>(esc: Escenario, ruta: string, usuario: string, cuerpo?: unknown) {
  const r = await fetch(`${url}/empresas/${esc.empresaId}/partidas${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${usuario}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const lote = (esc: Escenario, ids: string[], usuario = CONTADOR) =>
  post<ResultadoContabilizacion>(esc, "/contabilizar", usuario, { ids });

/** Empresa nueva (su numeración empieza en 1) con los contadores como miembros. */
async function nuevaEmpresa(): Promise<Escenario> {
  const esc = await crearEscenario(c, `0614-300000-${String(++nits).padStart(3, "0")}-0`);
  for (const id of CONTADORES) {
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
      [id, esc.empresaId],
    );
  }
  return esc;
}

async function borradores(esc: Escenario, n: number, fecha = "2026-11-10") {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(
      await crearPartida(c, esc, fecha, [
        [esc.cuentas["110101"]!, "25.00", "0"],
        [esc.cuentas["5101"]!, "0", "25.00"],
      ]),
    );
  }
  return ids;
}

/** Estado final en la base: cada partida contabilizada una vez y números 1…n sin huecos. */
async function verificarNumeracion(esc: Escenario, esperadas: number) {
  const filas = await c.query<{ numero: number }>(
    "select numero from partidas where empresa_id = $1 and estado = 'contabilizada' order by numero",
    [esc.empresaId],
  );
  expect(filas.rows.map((f) => f.numero)).toEqual(Array.from({ length: esperadas }, (_, i) => i + 1));
  const correlativo = await c.query("select ultimo from correlativos where empresa_id = $1", [esc.empresaId]);
  expect(correlativo.rows).toEqual([{ ultimo: esperadas }]);
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_correlativos");
  c = await reiniciarBase(urlBase);
  for (const [i, id] of CONTADORES.entries()) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Contador ${i + 1}`,
      `${id}@prueba.sv`,
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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("correlativos con varios usuarios contabilizando a la vez (API)", () => {
  it("tres contadores, partida por partida, no repiten ni saltan números", async () => {
    const esc = await nuevaEmpresa();
    const ids = await borradores(esc, 15);

    const respuestas = await Promise.all(
      ids.map((id, i) => post<{ numero: number }>(esc, `/${id}/contabilizar`, CONTADORES[i % 3]!)),
    );

    expect(respuestas.map((r) => r.status)).toEqual(ids.map(() => 200));
    await verificarNumeracion(esc, 15);
  });

  it("lotes simultáneos que se traslapan contabilizan cada partida una sola vez", async () => {
    const esc = await nuevaEmpresa();
    const ids = await borradores(esc, 12);
    // Cada lote comparte partidas con los otros y las pide en distinto orden
    const lotes = [ids.slice(0, 8), ids.slice(4).toReversed(), [...ids.slice(0, 3), ...ids.slice(8)]];

    const respuestas = await Promise.all(lotes.map((l, i) => lote(esc, l, CONTADORES[i])));

    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
    const contabilizadas = respuestas.flatMap((r) => r.cuerpo.contabilizadas);
    expect(contabilizadas.map((p) => p.id).toSorted()).toEqual(ids.toSorted());
    // Las repetidas aparecen como rechazadas en los otros lotes porque ya no son borradores
    const rechazadas = respuestas.flatMap((r) => r.cuerpo.rechazadas);
    expect(rechazadas.every((p) => p.motivo === "no_es_borrador")).toBe(true);
    expect(contabilizadas.length + rechazadas.length).toBe(lotes.flat().length);
    await verificarNumeracion(esc, 12);
  });

  it("lotes e individuales mezclados, con descuadradas, no dejan huecos", async () => {
    const esc = await nuevaEmpresa();
    const ids = await borradores(esc, 10);
    const descuadrada = await crearPartida(c, esc, "2026-11-10", [
      [esc.cuentas["110101"]!, "30.00", "0"],
      [esc.cuentas["5101"]!, "0", "20.00"],
    ]);

    await Promise.all([
      lote(esc, [...ids.slice(0, 5), descuadrada]),
      lote(esc, [descuadrada, ...ids.slice(5)], CONTADORES[1]),
      ...ids.slice(3, 7).map((id) => post(esc, `/${id}/contabilizar`, CONTADORES[2]!)),
      post(esc, `/${descuadrada}/contabilizar`, CONTADORES[2]!),
    ]);

    await verificarNumeracion(esc, 10);
    const estado = await c.query("select estado, numero from partidas where id = $1", [descuadrada]);
    expect(estado.rows[0]).toEqual({ estado: "borrador", numero: null });
  });

  it("dentro de un lote el orden por fecha se respeta aunque haya otros lotes en curso", async () => {
    const esc = await nuevaEmpresa();
    const del20 = await borradores(esc, 3, "2026-11-20");
    const del05 = await borradores(esc, 3, "2026-11-05");
    const otras = await borradores(esc, 6, "2026-11-12");

    const [r] = await Promise.all([
      lote(esc, [...del20, ...del05]),
      lote(esc, otras.slice(0, 3), CONTADORES[1]),
      lote(esc, otras.slice(3), CONTADORES[2]),
    ]);

    // El lote recibe números crecientes y las del 5 van antes que las del 20
    const numeros = new Map(r.cuerpo.contabilizadas.map((p) => [p.id, p.numero]));
    const de = (ids: string[]) => ids.map((id) => numeros.get(id)!);
    expect(Math.max(...de(del05))).toBeLessThan(Math.min(...de(del20)));
    await verificarNumeracion(esc, 12);
  });
});
