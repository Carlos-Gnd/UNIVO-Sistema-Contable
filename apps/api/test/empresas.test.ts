// Registro y edición de empresas (HU-06, S1-T38 y S1-T39) de punta a punta: HTTP → caso de uso → PostgreSQL.
// Usa una base propia (contable_api_empresas) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearPartida, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/**
 * Supabase simulado: "Bearer <id>" o "Bearer <id>|<correo>" es un token válido de ese usuario.
 * El correo es el que trae el JWT; se usa para registrar al usuario la primera vez.
 */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => {
    const [id, email] = token.split("|");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return email ? { id, email } : { id };
  },
};

const ANA = "a1111111-1111-4111-8111-111111111111"; // ya registrada en usuarios
const BETO = "b2222222-2222-4222-8222-222222222222"; // contador de la empresa de Ana
const CARLA = "c3333333-3333-4333-8333-333333333333"; // ajena a la empresa
const NUEVO = "d4444444-4444-4444-8444-444444444444"; // existe en Supabase Auth, todavía no en usuarios

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;

async function pedir(metodo: string, ruta: string, token: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const sociedad = (nit: string, extra: Record<string, unknown> = {}) => ({
  nombre: "Comercial Oriente, S.A. de C.V.",
  nit,
  tipoContribuyente: "sociedad",
  ...extra,
});

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_empresas");
  c = await reiniciarBase(urlBase);
  const usuarios: [string, string][] = [
    [ANA, "Ana"],
    [BETO, "Beto"],
    [CARLA, "Carla"],
  ];
  for (const [id, nombre] of usuarios) {
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

describe("POST /empresas", () => {
  it("exige un token válido", async () => {
    expect((await pedir("POST", "/empresas", null, sociedad("0614-010190-101-5"))).status).toBe(401);
  });

  it("registra la empresa con los datos normalizados y responde 201", async () => {
    const r = await pedir("POST", "/empresas", ANA, {
      ...sociedad("06140101901015"),
      nrc: "1234567",
      nombreComercial: "",
      correo: "",
      clasificacion: "mediano",
    });
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      nombre: "Comercial Oriente, S.A. de C.V.",
      nit: "0614-010190-101-5",
      nrc: "123456-7",
      nombreComercial: null,
      correo: null,
      tipoContribuyente: "sociedad",
      clasificacion: "mediano",
      modoNumeracion: "anual",
      activa: true,
    });
  });

  it("crea la casa matriz con valores por defecto y la dirección de la empresa (S1-T44)", async () => {
    const r = await pedir(
      "POST",
      "/empresas",
      ANA,
      sociedad("0614-150390-101-8", { direccion: "Av. Roosevelt Sur, San Miguel" }),
    );
    const s = await c.query(
      `select nombre, codigo_establecimiento, codigo_punto_venta, direccion, es_matriz, activa
       from sucursales where empresa_id = $1`,
      [r.cuerpo["id"]],
    );
    expect(s.rows).toEqual([
      {
        nombre: "Casa matriz",
        codigo_establecimiento: "0001",
        codigo_punto_venta: "0001",
        direccion: "Av. Roosevelt Sur, San Miguel",
        es_matriz: true,
        activa: true,
      },
    ]);
  });

  it("acepta los datos de la casa matriz, con los códigos que asignó Hacienda", async () => {
    const r = await pedir(
      "POST",
      "/empresas",
      ANA,
      sociedad("0000-000000-011-5", {
        casaMatriz: { nombre: "Matriz San Miguel", codigoEstablecimiento: "m001", codigoPuntoVenta: "P001" },
      }),
    );
    expect(r.status).toBe(201);
    const s = await c.query(
      "select nombre, codigo_establecimiento, codigo_punto_venta from sucursales where empresa_id = $1",
      [r.cuerpo["id"]],
    );
    expect(s.rows).toEqual([
      { nombre: "Matriz San Miguel", codigo_establecimiento: "M001", codigo_punto_venta: "P001" },
    ]);

    const malo = await pedir(
      "POST",
      "/empresas",
      ANA,
      sociedad("0614-010190-100-0", { casaMatriz: { codigoEstablecimiento: "1" } }),
    );
    expect(malo.status).toBe(400);
    expect(Object.keys(malo.cuerpo["errores"] as object)).toEqual(["casaMatriz"]);
  });

  it("deja al creador como administrador con acceso a todas las sucursales (S1-T39)", async () => {
    const r = await pedir("POST", "/empresas", ANA, sociedad("1234-567890-123-0"));
    const membresia = await c.query(
      `select r.codigo as rol, m.todas_sucursales, m.activa from membresias m join roles r on r.id = m.rol_id
       where m.usuario_id = $1 and m.empresa_id = $2`,
      [ANA, r.cuerpo["id"]],
    );
    expect(membresia.rows).toEqual([{ rol: "administrador", todas_sucursales: true, activa: true }]);
    const bitacora = await c.query(
      "select usuario_id from bitacora where tabla = 'empresas' and registro_id = $1 and accion = 'INSERT'",
      [r.cuerpo["id"]],
    );
    expect(bitacora.rows).toEqual([{ usuario_id: ANA }]);
  });

  it("registra en usuarios a quien crea su primera empresa, con el correo de su cuenta", async () => {
    const r = await pedir("POST", "/empresas", `${NUEVO}|maria.lopez@ejemplo.com`, {
      nombre: "María López",
      nit: "12345678-4",
      tipoContribuyente: "persona_natural",
    });
    expect(r.status).toBe(201);
    const u = await c.query("select nombre, correo from usuarios where id = $1", [NUEVO]);
    expect(u.rows).toEqual([{ nombre: "maria.lopez", correo: "maria.lopez@ejemplo.com" }]);
  });

  it("responde 422 si la cuenta no está registrada y el token no trae correo", async () => {
    const sinCorreo = "e5555555-5555-4555-8555-555555555555";
    const r = await pedir("POST", "/empresas", sinCorreo, sociedad("0000-000000-104-0"));
    expect(r.status).toBe(422);
    const n = await c.query("select count(*)::int as n from empresas where nit = '0000-000000-104-0'");
    expect(n.rows[0].n).toBe(0);
  });

  it("valida NIT, NRC y tipo de contribuyente con los errores por campo", async () => {
    const r = await pedir("POST", "/empresas", ANA, {
      nombre: "",
      nit: "0614-010190-101-1",
      nrc: "abc",
      tipoContribuyente: "cooperativa",
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.cuerpo["errores"] as object).sort()).toEqual([
      "nit",
      "nombre",
      "nrc",
      "tipoContribuyente",
    ]);

    const dui = await pedir("POST", "/empresas", ANA, sociedad("12345678-4"));
    expect(dui.status).toBe(400);
    expect(dui.cuerpo["errores"]).toEqual({ nit: [expect.stringMatching(/NIT de 14 dígitos/)] });
  });

  it("responde 409 si el NIT ya está registrado y no crea la membresía", async () => {
    const antes = (await c.query("select count(*)::int as n from membresias")).rows[0].n as number;
    const r = await pedir("POST", "/empresas", ANA, sociedad("0614-010190-101-5"));
    expect(r.status).toBe(409);
    expect(r.cuerpo["message"]).toMatch(/0614-010190-101-5/);
    expect((await c.query("select count(*)::int as n from membresias")).rows[0].n).toBe(antes);
  });
});

describe("GET y PATCH /empresas/:id", () => {
  let empresaId: string;

  beforeAll(async () => {
    const r = await pedir("POST", "/empresas", ANA, sociedad("1000-000000-009-0", { telefono: "2661-0000" }));
    empresaId = r.cuerpo["id"] as string;
    await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
      [BETO, empresaId],
    );
  });

  it("los miembros consultan la empresa; los ajenos reciben 404", async () => {
    expect((await pedir("GET", `/empresas/${empresaId}`, BETO)).cuerpo).toMatchObject({ id: empresaId });
    expect((await pedir("GET", `/empresas/${empresaId}`, CARLA)).status).toBe(404);
    expect((await pedir("GET", `/empresas/${CARLA}`, ANA)).status).toBe(404);
    expect((await pedir("GET", "/empresas/no-es-uuid", ANA)).status).toBe(400);
  });

  it("el administrador edita solo los campos enviados y puede borrar los opcionales", async () => {
    const r = await pedir("PATCH", `/empresas/${empresaId}`, ANA, {
      nombreComercial: "Ferretería Oriente",
      telefono: null,
      direccion: "",
    });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      nombre: "Comercial Oriente, S.A. de C.V.",
      nombreComercial: "Ferretería Oriente",
      telefono: null,
      direccion: null,
    });
  });

  it("el contador no tiene empresa.configurar: 403", async () => {
    const r = await pedir("PATCH", `/empresas/${empresaId}`, BETO, { telefono: "1" });
    expect(r.status).toBe(403);
  });

  it("un usuario ajeno recibe 404 al editar", async () => {
    expect((await pedir("PATCH", `/empresas/${empresaId}`, CARLA, { telefono: "1" })).status).toBe(404);
  });

  it("rechaza campos que no se editan, cuerpos vacíos y NIT inválidos", async () => {
    const tipo = await pedir("PATCH", `/empresas/${empresaId}`, ANA, {
      tipoContribuyente: "persona_natural",
    });
    expect(tipo.status).toBe(400);
    expect((await pedir("PATCH", `/empresas/${empresaId}`, ANA, {})).status).toBe(400);
    expect((await pedir("PATCH", `/empresas/${empresaId}`, ANA, { nit: "1000-000000-009-1" })).status).toBe(
      400,
    );
    // una sociedad no puede cambiar su NIT por un DUI
    expect((await pedir("PATCH", `/empresas/${empresaId}`, ANA, { nit: "12345678-4" })).status).toBe(422);
  });

  it("responde 409 si el NIT nuevo pertenece a otra empresa", async () => {
    const r = await pedir("PATCH", `/empresas/${empresaId}`, ANA, { nit: "0614-010190-101-5" });
    expect(r.status).toBe(409);
  });

  it("la numeración cambia mientras no haya partidas contabilizadas", async () => {
    const r = await pedir("PATCH", `/empresas/${empresaId}`, ANA, { modoNumeracion: "mensual" });
    expect(r.cuerpo).toMatchObject({ modoNumeracion: "mensual" });

    // La casa matriz ya existe: se creó junto con la empresa (S1-T44)
    const s = await c.query("select id from sucursales where empresa_id = $1 and es_matriz", [empresaId]);
    await c.query(
      `insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')`,
      [empresaId],
    );
    const cuentas: Record<string, string> = {};
    for (const [codigo, naturaleza, tipo] of [
      ["1", "deudora", "activo"],
      ["5", "acreedora", "ingresos"],
    ]) {
      const k = await c.query(
        `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values ($1, $2, $2, $3, $4) returning id`,
        [empresaId, codigo, naturaleza, tipo],
      );
      cuentas[codigo!] = k.rows[0].id;
    }
    const escenario = { empresaId, sucursalId: s.rows[0].id as string, cuentas };
    const id = await crearPartida(c, escenario, "2026-03-01", [
      [cuentas["1"]!, "10", "0"],
      [cuentas["5"]!, "0", "10"],
    ]);
    await c.query("update partidas set estado = 'contabilizada' where id = $1", [id]);

    const bloqueada = await pedir("PATCH", `/empresas/${empresaId}`, ANA, { modoNumeracion: "anual" });
    expect(bloqueada.status).toBe(422);
    expect(bloqueada.cuerpo["message"]).toMatch(/partidas contabilizadas/);
  });
});
