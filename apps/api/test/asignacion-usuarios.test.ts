// Asignación de roles desde HTTP contra PostgreSQL real, incluyendo bitácora y reglas de sucursales.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;

async function pedir(empresaId: string, actorId: string, miembroId: string, datos: unknown) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}/usuarios/${miembroId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${actorId}`, "content-type": "application/json" },
    body: JSON.stringify(datos),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

async function escenario(roles: { actor: string; miembro: string }) {
  const empresaId = randomUUID();
  const actorId = randomUUID();
  const miembroId = randomUUID();
  await c.query(
    `insert into usuarios (id, nombre, correo) values
       ($1, 'Actor prueba', $2), ($3, 'Miembro prueba', $4)`,
    [actorId, `${actorId}@prueba.sv`, miembroId, `${miembroId}@prueba.sv`],
  );
  await c.query(
    `insert into empresas (id, nombre, nit, tipo_contribuyente)
     values ($1, 'Empresa prueba', $2, 'persona_natural')`,
    [empresaId, empresaId.replaceAll("-", "").slice(0, 14)],
  );
  const sucursal = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento)
     values ($1, 'Sucursal activa', '0001') returning id`,
    [empresaId],
  );
  const inactiva = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento, activa)
     values ($1, 'Sucursal inactiva', '0002', false) returning id`,
    [empresaId],
  );
  for (const [usuarioId, codigo] of [
    [actorId, roles.actor],
    [miembroId, roles.miembro],
  ]) {
    await c.query(
      `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales)
       select $1, $2, id, $3 from roles where codigo = $4`,
      [usuarioId, empresaId, codigo === "administrador" || codigo === "contador", codigo],
    );
  }
  return {
    empresaId,
    actorId,
    miembroId,
    sucursalId: sucursal.rows[0]!.id,
    sucursalInactivaId: inactiva.rows[0]!.id,
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_asignacion");
  c = await reiniciarBase(urlBase);
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

describe("PATCH /empresas/:empresaId/usuarios/:usuarioId", () => {
  it("rechaza bajar el rol del único administrador con 409", async () => {
    const e = await escenario({ actor: "administrador", miembro: "contador" });
    const respuesta = await pedir(e.empresaId, e.actorId, e.actorId, { rol: "contador", sucursales: [] });
    expect(respuesta.status).toBe(409);
    expect(respuesta.cuerpo["message"]).toMatch(/al menos un administrador/);
    const actual = await c.query<{ codigo: string }>(
      `select r.codigo from membresias m join roles r on r.id = m.rol_id
       where m.empresa_id = $1 and m.usuario_id = $2`,
      [e.empresaId, e.actorId],
    );
    expect(actual.rows[0]?.codigo).toBe("administrador");
  });

  it("permite bajar a un administrador cuando hay otro y registra al actor en bitácora", async () => {
    const e = await escenario({ actor: "administrador", miembro: "administrador" });
    const respuesta = await pedir(e.empresaId, e.actorId, e.miembroId, { rol: "contador", sucursales: [] });
    expect(respuesta.status).toBe(200);
    const bitacora = await c.query<{ usuario_id: string; accion: string }>(
      `select usuario_id, accion from bitacora
       where empresa_id = $1 and tabla = 'membresias' and registro_id = (
         select id::text from membresias where empresa_id = $1 and usuario_id = $2
       ) and accion = 'UPDATE'`,
      [e.empresaId, e.miembroId],
    );
    expect(bitacora.rows[0]).toEqual({ usuario_id: e.actorId, accion: "UPDATE" });
  });

  it("requiere usuarios.gestionar", async () => {
    const e = await escenario({ actor: "consulta", miembro: "auxiliar" });
    expect((await pedir(e.empresaId, e.actorId, e.miembroId, { rol: "contador" })).status).toBe(403);
  });

  it("rechaza una sucursal inactiva y permite cambiar de contador a auxiliar en una sucursal activa", async () => {
    const e = await escenario({ actor: "administrador", miembro: "contador" });
    const rechazada = await pedir(e.empresaId, e.actorId, e.miembroId, {
      rol: "auxiliar",
      sucursales: [e.sucursalInactivaId],
    });
    expect(rechazada.status).toBe(400);

    const aceptada = await pedir(e.empresaId, e.actorId, e.miembroId, {
      rol: "auxiliar",
      sucursales: [e.sucursalId],
    });
    expect(aceptada.status).toBe(200);
    const asignaciones = await c.query<{ codigo: string; sucursal_id: string }>(
      `select r.codigo, ms.sucursal_id from membresias m
       join roles r on r.id = m.rol_id
       join membresia_sucursales ms on ms.membresia_id = m.id
       where m.empresa_id = $1 and m.usuario_id = $2`,
      [e.empresaId, e.miembroId],
    );
    expect(asignaciones.rows).toEqual([{ codigo: "auxiliar", sucursal_id: e.sucursalId }]);
  });
});
