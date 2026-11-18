import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  crearEscenario,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers.js";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const ADMIN = "61111111-1111-4111-8111-111111111111";
const CONTADOR = "62222222-2222-4222-8222-222222222222";
const AUXILIAR = "63333333-3333-4333-8333-333333333333";
const CONSULTA = "64444444-4444-4444-8444-444444444444";
const SIN_MEMBRESIA = "65555555-5555-4555-8555-555555555555";
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;

async function pedir(metodo: string, ruta: string, usuario: string, cuerpo?: unknown) {
  const response = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${usuario}`,
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: response.status, cuerpo: (await response.json()) as Record<string, unknown> };
}

async function periodo(mes: number, escenario = esc) {
  const result = await c.query("select id from periodos where empresa_id = $1 and mes = $2", [
    escenario.empresaId,
    mes,
  ]);
  return result.rows[0]?.id as string;
}

async function crearBorrador(mes: number) {
  return pedir("POST", `/empresas/${esc.empresaId}/partidas`, CONTADOR, {
    sucursalId: esc.sucursalId,
    fecha: `2026-${String(mes).padStart(2, "0")}-10`,
    tipo: "operacion",
    concepto: `Borrador mes ${mes}`,
    lineas: [
      { cuentaId: esc.cuentas["110101"], debe: "100" },
      { cuentaId: esc.cuentas["5101"], haber: "100" },
    ],
  });
}

beforeAll(async () => {
  const databaseUrl = await basePropia("contable_api_cerrar_periodo");
  c = await reiniciarBase(databaseUrl);
  esc = await crearEscenario(c, "0614-030190-101-7");
  ajena = await crearEscenario(c, "0614-030190-102-2");
  for (const [id, rol] of [
    [ADMIN, 1],
    [CONTADOR, 2],
    [AUXILIAR, 3],
    [CONSULTA, 4],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      id,
      `${id}@periodos.test`,
    ]);
    const membership = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
      [id, esc.empresaId, rol, rol <= 2],
    );
    if (rol >= 3) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        membership.rows[0].id,
        esc.sucursalId,
      ]);
    }
  }
  await c.query("insert into usuarios (id, nombre, correo) values ($1, 'Sin membresia', $2)", [
    SIN_MEMBRESIA,
    `${SIN_MEMBRESIA}@periodos.test`,
  ]);
  process.env["DATABASE_URL"] = databaseUrl;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
}, 60000);

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("POST /empresas/:empresa/periodos/:periodo/cerrar", () => {
  it("cierra un período vacío y deja fecha y actor en la bitácora", async () => {
    const id = await periodo(1);
    const response = await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONTADOR);
    expect(response.status).toBe(201);
    expect(response.cuerpo).toMatchObject({ id, mes: 1, estado: "cerrado" });
    expect(response.cuerpo["cerradoEn"]).toBeTruthy();
    const audit = await c.query(
      "select usuario_id, datos_anteriores, datos_nuevos from bitacora where empresa_id = $1 and tabla = 'periodos' and registro_id = $2 order by creado_en desc limit 1",
      [esc.empresaId, id],
    );
    expect(audit.rows[0]).toMatchObject({ usuario_id: CONTADOR });
    expect(audit.rows[0]?.datos_anteriores).toMatchObject({ estado: "abierto" });
    expect(audit.rows[0]?.datos_nuevos).toMatchObject({ estado: "cerrado" });
  });

  it("devuelve borradores con fecha, concepto y sucursal; al contabilizarlos permite cerrar", async () => {
    const borrador = await crearBorrador(2);
    expect(borrador.status).toBe(201);
    const id = await periodo(2);
    const bloqueado = await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONTADOR);
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.cuerpo["borradores"]).toEqual([
      expect.objectContaining({
        id: borrador.cuerpo["id"],
        fecha: "2026-02-10",
        concepto: "Borrador mes 2",
        sucursalId: esc.sucursalId,
      }),
    ]);
    const contabilizada = await pedir(
      "POST",
      `/empresas/${esc.empresaId}/partidas/${borrador.cuerpo["id"]}/contabilizar`,
      CONTADOR,
    );
    expect(contabilizada.status).toBe(200);
    const cerrado = await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONTADOR);
    expect(cerrado.status).toBe(201);
    expect(cerrado.cuerpo).toMatchObject({ estado: "cerrado", mes: 2 });
  });

  it("rechaza el cierre repetido y oculta períodos inexistentes o de otra empresa", async () => {
    const id = await periodo(3);
    expect((await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONTADOR)).status).toBe(
      201,
    );
    expect((await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONTADOR)).status).toBe(
      409,
    );
    expect(
      (
        await pedir(
          "POST",
          `/empresas/${esc.empresaId}/periodos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cerrar`,
          CONTADOR,
        )
      ).status,
    ).toBe(404);
    const idAjeno = await periodo(3, ajena);
    expect(
      (await pedir("POST", `/empresas/${ajena.empresaId}/periodos/${idAjeno}/cerrar`, CONTADOR)).status,
    ).toBe(404);
  });

  it("deniega auxiliar y consulta, y devuelve 404 a quien no pertenece a la empresa", async () => {
    const id = await periodo(4);
    expect((await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, AUXILIAR)).status).toBe(
      403,
    );
    expect((await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONSULTA)).status).toBe(
      403,
    );
    expect(
      (await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, SIN_MEMBRESIA)).status,
    ).toBe(404);
  });

  it("impide registrar partidas nuevas dentro de un período cerrado", async () => {
    const id = await periodo(5);
    expect((await pedir("POST", `/empresas/${esc.empresaId}/periodos/${id}/cerrar`, CONTADOR)).status).toBe(
      201,
    );
    expect((await crearBorrador(5)).status).toBe(422);
    expect(
      (
        await c.query("select count(*) from partidas where empresa_id = $1 and periodo_id = $2", [
          esc.empresaId,
          id,
        ])
      ).rows[0]?.count,
    ).toBe("0");
  });
});
