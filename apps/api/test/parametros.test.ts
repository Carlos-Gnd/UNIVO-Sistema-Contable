// Parámetros contables de la empresa (HU-12) de punta a punta: HTTP → caso de uso → PostgreSQL.
// S2-T02 (consultar y actualizar, con bitácora) y S2-T04 (bloqueados cuando ya hay partidas).
// Usa una base propia (contable_api_parametros) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, contabilizar, crearPartida, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const ANA = "a1111111-1111-4111-8111-111111111111"; // administradora
const BETO = "b2222222-2222-4222-8222-222222222222"; // contador
const CARLA = "c3333333-3333-4333-8333-333333333333"; // ajena a la empresa

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;

async function pedir(metodo: string, ruta: string, token: string, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

/** Registra una empresa a nombre de Ana (administradora) con Beto como contador. */
async function empresa(nit: string): Promise<string> {
  const r = await pedir("POST", "/empresas", ANA, {
    nombre: `Empresa ${nit}`,
    nit,
    tipoContribuyente: "sociedad",
  });
  const id = r.cuerpo["id"] as string;
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [BETO, id],
  );
  return id;
}

/** Registra una partida en la empresa y la deja en el estado indicado. */
async function partida(empresaId: string, estado: "borrador" | "contabilizada" | "anulada") {
  const s = await c.query("select id from sucursales where empresa_id = $1 and es_matriz", [empresaId]);
  await c.query(
    `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')
     on conflict do nothing`,
    [empresaId],
  );
  const filas = await c.query<{ codigo: string; id: string }>(
    "select codigo, id from cuentas where empresa_id = $1 and codigo in ('110101', '5101')",
    [empresaId],
  );
  const cuentas = Object.fromEntries(filas.rows.map((f) => [f.codigo, f.id]));
  const id = await crearPartida(c, { empresaId, sucursalId: s.rows[0].id as string, cuentas }, "2026-03-01", [
    [cuentas["110101"]!, "10", "0"],
    [cuentas["5101"]!, "0", "10"],
  ]);
  if (estado !== "borrador") await contabilizar(c, id);
  if (estado === "anulada") {
    await c.query("update partidas set estado = 'anulada', motivo_anulacion = 'Duplicada' where id = $1", [
      id,
    ]);
  }
}

const ruta = (empresaId: string) => `/empresas/${empresaId}/parametros`;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_parametros");
  c = await reiniciarBase(urlBase);
  for (const [id, nombre] of [
    [ANA, "Ana"],
    [BETO, "Beto"],
    [CARLA, "Carla"],
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
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/:empresaId/parametros (S2-T02)", () => {
  let empresaId: string;
  beforeAll(async () => {
    empresaId = await empresa("0614-010190-101-5");
  });

  it("los miembros consultan los valores por defecto, sin bloqueos", async () => {
    const r = await pedir("GET", ruta(empresaId), BETO);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({
      modoNumeracion: "anual",
      formatoEstados: "clase",
      metodoValuacion: "promedio_ponderado",
      sistemaInventario: "perpetuo",
      tieneMovimientos: false,
      bloqueados: [],
    });
  });

  it("un usuario ajeno recibe 404", async () => {
    expect((await pedir("GET", ruta(empresaId), CARLA)).status).toBe(404);
  });
});

describe("PATCH /empresas/:empresaId/parametros (S2-T02)", () => {
  let empresaId: string;
  beforeAll(async () => {
    empresaId = await empresa("0614-150390-101-8");
  });

  it("el administrador cambia solo los parámetros enviados", async () => {
    const r = await pedir("PATCH", ruta(empresaId), ANA, {
      formatoEstados: "niif_pymes",
      metodoValuacion: "peps",
    });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      modoNumeracion: "anual",
      formatoEstados: "niif_pymes",
      metodoValuacion: "peps",
      sistemaInventario: "perpetuo",
    });
  });

  it("deja el cambio en la bitácora a nombre del usuario, con el valor anterior y el nuevo", async () => {
    await pedir("PATCH", ruta(empresaId), ANA, { sistemaInventario: "analitico" });
    const b = await c.query(
      `select usuario_id, datos_anteriores ->> 'sistema_inventario' as antes,
              datos_nuevos ->> 'sistema_inventario' as despues
       from bitacora where tabla = 'empresas' and registro_id = $1 and accion = 'UPDATE'
       order by id desc limit 1`,
      [empresaId],
    );
    expect(b.rows).toEqual([{ usuario_id: ANA, antes: "perpetuo", despues: "analitico" }]);
  });

  it("el contador no tiene empresa.configurar: 403", async () => {
    expect((await pedir("PATCH", ruta(empresaId), BETO, { formatoEstados: "clase" })).status).toBe(403);
  });

  it("un usuario ajeno recibe 404", async () => {
    expect((await pedir("PATCH", ruta(empresaId), CARLA, { formatoEstados: "clase" })).status).toBe(404);
  });

  it("rechaza valores fuera del catálogo, campos que no son parámetros y cuerpos vacíos", async () => {
    const malo = await pedir("PATCH", ruta(empresaId), ANA, { metodoValuacion: "ueps" });
    expect(malo.status).toBe(400);
    expect(Object.keys(malo.cuerpo["errores"] as object)).toEqual(["metodoValuacion"]);
    expect((await pedir("PATCH", ruta(empresaId), ANA, { nombre: "Otra" })).status).toBe(400);
    expect((await pedir("PATCH", ruta(empresaId), ANA, {})).status).toBe(400);
  });
});

describe("parámetros bloqueados cuando ya hay partidas (S2-T04)", () => {
  it("los borradores no bloquean: todo se puede cambiar", async () => {
    const empresaId = await empresa("0614-210587-102-4");
    await partida(empresaId, "borrador");
    const r = await pedir("PATCH", ruta(empresaId), ANA, {
      modoNumeracion: "mensual",
      metodoValuacion: "peps",
      sistemaInventario: "analitico",
    });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ tieneMovimientos: false, bloqueados: [] });
  });

  describe("con una partida contabilizada", () => {
    let empresaId: string;
    beforeAll(async () => {
      empresaId = await empresa("1234-567890-123-0");
      await partida(empresaId, "contabilizada");
    });

    it("la consulta indica los parámetros bloqueados", async () => {
      expect((await pedir("GET", ruta(empresaId), ANA)).cuerpo).toMatchObject({
        tieneMovimientos: true,
        bloqueados: ["modoNumeracion", "metodoValuacion", "sistemaInventario"],
      });
    });

    it.each([
      ["modoNumeracion", "mensual", "la numeración de partidas"],
      ["metodoValuacion", "peps", "el método de valuación"],
      ["sistemaInventario", "analitico", "el sistema de inventario"],
    ])("responde 422 al cambiar %s y no lo guarda", async (parametro, valor, nombre) => {
      const r = await pedir("PATCH", ruta(empresaId), ANA, { [parametro]: valor });
      expect(r.status).toBe(422);
      expect(r.cuerpo["message"]).toBe(
        `La empresa ya tiene partidas contabilizadas: no se puede cambiar ${nombre}.`,
      );
      expect((await pedir("GET", ruta(empresaId), ANA)).cuerpo).toMatchObject({
        modoNumeracion: "anual",
        metodoValuacion: "promedio_ponderado",
        sistemaInventario: "perpetuo",
      });
    });

    it("si un parámetro está bloqueado no se aplica ninguno de los enviados", async () => {
      const r = await pedir("PATCH", ruta(empresaId), ANA, {
        formatoEstados: "niif_pymes",
        metodoValuacion: "peps",
      });
      expect(r.status).toBe(422);
      expect((await pedir("GET", ruta(empresaId), ANA)).cuerpo["formatoEstados"]).toBe("clase");
    });

    it("el formato de los estados sí se cambia, y reenviar los valores actuales no cuenta como cambio", async () => {
      const r = await pedir("PATCH", ruta(empresaId), ANA, {
        formatoEstados: "niif_pymes",
        modoNumeracion: "anual",
        sistemaInventario: "perpetuo",
      });
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ formatoEstados: "niif_pymes", tieneMovimientos: true });
    });
  });

  it("una partida anulada también bloquea", async () => {
    const empresaId = await empresa("0000-000000-011-5");
    await partida(empresaId, "anulada");
    expect((await pedir("PATCH", ruta(empresaId), ANA, { modoNumeracion: "por_tipo" })).status).toBe(422);
  });

  it("los movimientos de una empresa no bloquean a otra", async () => {
    const libre = await empresa("1000-000000-009-0");
    expect((await pedir("PATCH", ruta(libre), ANA, { modoNumeracion: "por_tipo" })).status).toBe(200);
  });
});
