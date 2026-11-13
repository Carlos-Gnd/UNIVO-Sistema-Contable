// Sucursales (HU-07, S1-T43) de punta a punta: HTTP → caso de uso → PostgreSQL.
// Usa una base propia (contable_api_sucursales) para correr en paralelo con las demás pruebas.
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
const CONTADOR = "b2222222-2222-4222-8222-222222222222"; // todas las sucursales, sin sucursales.gestionar
const AUXILIAR = "c3333333-3333-4333-8333-333333333333"; // solo la sucursal de Usulután
const AJENO = "d4444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let empresaId: string;
let matrizId: string;

async function pedir(metodo: string, ruta: string, token: string | null, cuerpo?: unknown) {
  const r = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  return { status: r.status, cuerpo: (texto ? JSON.parse(texto) : null) as Record<string, unknown> };
}

const sucursales = (token: string) => pedir("GET", `/empresas/${empresaId}/sucursales`, token);
const crear = (cuerpo: unknown, token = ADMIN) =>
  pedir("POST", `/empresas/${empresaId}/sucursales`, token, cuerpo);
const editar = (id: string, cuerpo: unknown, token = ADMIN) =>
  pedir("PATCH", `/empresas/${empresaId}/sucursales/${id}`, token, cuerpo);

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_sucursales");
  c = await reiniciarBase(urlBase);
  for (const [id, nombre] of [
    [ADMIN, "admin"],
    [CONTADOR, "contador"],
    [AUXILIAR, "auxiliar"],
    [AJENO, "ajeno"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre}@prueba.sv`,
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

  // La empresa se registra por la API: así se crea su casa matriz (S1-T44)
  const r = await pedir("POST", "/empresas", ADMIN, {
    nombre: "Comercial Oriente, S.A. de C.V.",
    nit: "0614-010190-101-5",
    tipoContribuyente: "sociedad",
  });
  empresaId = r.cuerpo["id"] as string;
  matrizId = (await sucursales(ADMIN)).cuerpo[0]!["id" as never] as string;
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, empresaId],
  );
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/:empresa/sucursales", () => {
  it("toda empresa nueva tiene su casa matriz", async () => {
    const r = await sucursales(ADMIN);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual([
      expect.objectContaining({
        id: matrizId,
        nombre: "Casa matriz",
        codigoEstablecimiento: "0001",
        codigoPuntoVenta: "0001",
        esMatriz: true,
        activa: true,
      }),
    ]);
  });

  it("un usuario ajeno a la empresa recibe 404 y sin token 401", async () => {
    expect((await sucursales(AJENO)).status).toBe(404);
    expect((await pedir("GET", `/empresas/${empresaId}/sucursales`, null)).status).toBe(401);
  });
});

describe("POST /empresas/:empresa/sucursales", () => {
  let usulutanId: string;

  it("el administrador crea una sucursal; los códigos se guardan en mayúsculas", async () => {
    const r = await crear({
      nombre: "Sucursal Usulután",
      codigoEstablecimiento: "s001",
      direccion: "Calle Grimaldi",
    });
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      nombre: "Sucursal Usulután",
      codigoEstablecimiento: "S001",
      codigoPuntoVenta: "0001",
      direccion: "Calle Grimaldi",
      esMatriz: false,
      activa: true,
    });
    usulutanId = r.cuerpo["id"] as string;
    const bitacora = await c.query(
      "select usuario_id from bitacora where tabla = 'sucursales' and registro_id = $1 and accion = 'INSERT'",
      [usulutanId],
    );
    expect(bitacora.rows).toEqual([{ usuario_id: ADMIN }]);
  });

  it("no se puede crear otra casa matriz", async () => {
    const r = await crear({ nombre: "Otra matriz", codigoEstablecimiento: "M002", esMatriz: true });
    expect(r.status).toBe(400);
  });

  it("responde 409 si el código de establecimiento y punto de venta ya existen en la empresa", async () => {
    const r = await crear({ nombre: "Duplicada", codigoEstablecimiento: "S001", codigoPuntoVenta: "0001" });
    expect(r.status).toBe(409);
    expect(r.cuerpo["message"]).toMatch(/S001/);
    // Mismo establecimiento con otro punto de venta sí se permite
    expect(
      (await crear({ nombre: "Caja 2", codigoEstablecimiento: "S001", codigoPuntoVenta: "P002" })).status,
    ).toBe(201);
  });

  it("valida los códigos de Hacienda", async () => {
    const r = await crear({ nombre: "", codigoEstablecimiento: "1", codigoPuntoVenta: "00-1" });
    expect(r.status).toBe(400);
    expect(Object.keys(r.cuerpo["errores"] as object).sort()).toEqual([
      "codigoEstablecimiento",
      "codigoPuntoVenta",
      "nombre",
    ]);
  });

  it("el contador ve las sucursales pero no las gestiona: 403", async () => {
    expect((await sucursales(CONTADOR)).status).toBe(200);
    expect((await crear({ nombre: "X", codigoEstablecimiento: "S009" }, CONTADOR)).status).toBe(403);
    expect((await editar(matrizId, { nombre: "X" }, CONTADOR)).status).toBe(403);
  });

  it("quien tiene sucursales asignadas solo ve esas", async () => {
    const m = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
      [AUXILIAR, empresaId],
    );
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0].id,
      usulutanId,
    ]);
    const r = await sucursales(AUXILIAR);
    expect((r.cuerpo as unknown as { id: string }[]).map((s) => s.id)).toEqual([usulutanId]);
  });
});

describe("PATCH /empresas/:empresa/sucursales/:sucursal", () => {
  let id: string;

  beforeAll(async () => {
    id = (await crear({ nombre: "San Miguel centro", codigoEstablecimiento: "S010", direccion: "4a Calle" }))
      .cuerpo["id"] as string;
  });

  it("edita los campos enviados y borra la dirección con null", async () => {
    const r = await editar(id, { nombre: "San Miguel, centro", direccion: null });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      nombre: "San Miguel, centro",
      direccion: null,
      codigoEstablecimiento: "S010",
    });
  });

  it("inactiva y reactiva la sucursal; sigue apareciendo en la lista", async () => {
    expect((await editar(id, { activa: false })).cuerpo).toMatchObject({ activa: false });
    const lista = (await sucursales(ADMIN)).cuerpo as unknown as { id: string; activa: boolean }[];
    expect(lista.find((s) => s.id === id)?.activa).toBe(false);
    expect((await editar(id, { activa: true })).cuerpo).toMatchObject({ activa: true });
  });

  it("la casa matriz no se puede inactivar", async () => {
    const r = await editar(matrizId, { activa: false });
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/casa matriz/);
  });

  it("no hay DELETE: una sucursal solo se inactiva", async () => {
    expect((await pedir("DELETE", `/empresas/${empresaId}/sucursales/${id}`, ADMIN)).status).toBe(404);
    expect((await c.query("select 1 from sucursales where id = $1", [id])).rowCount).toBe(1);
  });

  it("con movimientos los códigos de Hacienda quedan fijos, pero se puede inactivar", async () => {
    await c.query(
      "insert into ejercicios (empresa_id, anio, fecha_inicio, fecha_fin) values ($1, 2026, '2026-01-01', '2026-12-31')",
      [empresaId],
    );
    await crearPartida(c, { empresaId, sucursalId: id, cuentas: {} }, "2026-05-01", []);

    const r = await editar(id, { codigoEstablecimiento: "S011" });
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/movimientos/);
    expect((await editar(id, { nombre: "San Miguel centro" })).status).toBe(200);
    expect((await editar(id, { activa: false })).cuerpo).toMatchObject({ activa: false });
  });

  it("responde 409 si los códigos nuevos ya los usa otra sucursal", async () => {
    const otra = (await crear({ nombre: "Sin movimientos", codigoEstablecimiento: "S020" })).cuerpo[
      "id"
    ] as string;
    expect((await editar(otra, { codigoEstablecimiento: "S001" })).status).toBe(409);
  });

  it("responde 404 con una sucursal de otra empresa y 400 con campos que no se editan", async () => {
    const otra = await pedir("POST", "/empresas", ADMIN, {
      nombre: "Otra",
      nit: "1234-567890-123-0",
      tipoContribuyente: "sociedad",
    });
    const ajena = (await pedir("GET", `/empresas/${otra.cuerpo["id"]}/sucursales`, ADMIN)).cuerpo[0]![
      "id" as never
    ] as string;
    expect((await editar(ajena, { nombre: "X" })).status).toBe(404);
    expect((await editar(id, { esMatriz: true })).status).toBe(400);
    expect((await editar(id, {})).status).toBe(400);
  });
});
