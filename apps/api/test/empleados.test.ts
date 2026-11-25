import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { EmpleadoVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "22222222-2222-4222-8222-222222222222";
const LIMITADO = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let sucursalExtra: string;

async function usuario(id: string, rol: number, empresaId: string) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${rol}`,
    `u${id.slice(0, 4)}@empleados.test`,
  ]);
  const r = await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresaId, rol, rol <= 2],
  );
  return r.rows[0]!.id as string;
}

async function pedir(
  metodo: string,
  ruta: string,
  usuarioId: string | null,
  cuerpo?: unknown,
  empresaId = esc.empresaId,
) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuarioId ? { authorization: `Bearer ${usuarioId}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return {
    status: respuesta.status,
    cuerpo: (await respuesta.json()) as Record<string, unknown> | EmpleadoVista[],
  };
}

function datos(sufijo: string, cambios: Record<string, unknown> = {}) {
  return {
    nombres: "Carlos",
    apellidos: `Empleado ${sufijo}`,
    dui: `DUI-${sufijo}`,
    nit: `NIT-${sufijo}`,
    numeroIsss: `ISSS-${sufijo}`,
    nup: `NUP-${sufijo}`,
    puesto: "Auxiliar contable",
    area: "Administración",
    salario: "800.00",
    fechaIngreso: "2026-01-15",
    sucursalId: esc.sucursalId,
    ...cambios,
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_empleados");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-710001-101-1");
  ajena = await crearEscenario(c, "0614-710002-101-2");

  await usuario(CONTADOR, 2, esc.empresaId);
  await usuario(CONSULTA, 4, esc.empresaId);
  const membresiaLimitada = await usuario(LIMITADO, 3, esc.empresaId);
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    membresiaLimitada,
    esc.sucursalId,
  ]);
  await usuario(FORASTERO, 2, ajena.empresaId);
  const sucursal = await c.query(
    "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal norte', 'N002') returning id",
    [esc.empresaId],
  );
  sucursalExtra = sucursal.rows[0]!.id as string;
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) select 3, id from permisos where modulo = 'planilla' and accion in ('ver', 'calcular')",
  );

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

describe("empleados", () => {
  it("registra, lista y consulta los datos con salario normalizado", async () => {
    const creado = await pedir("POST", "/empleados", CONTADOR, datos("001"));
    expect(creado.status).toBe(201);
    expect(creado.cuerpo).toMatchObject({
      nombres: "Carlos",
      apellidos: "Empleado 001",
      dui: "DUI-001",
      nit: "NIT-001",
      numeroIsss: "ISSS-001",
      nup: "NUP-001",
      puesto: "Auxiliar contable",
      area: "Administración",
      salario: "800.00",
      fechaIngreso: "2026-01-15",
      sucursalId: esc.sucursalId,
      sucursal: "Casa matriz",
      activo: true,
    });
    const id = (creado.cuerpo as Record<string, unknown>)["id"] as string;
    const lista = await pedir("GET", "/empleados?activo=true", CONTADOR);
    expect((lista.cuerpo as EmpleadoVista[]).map((e) => e.id)).toContain(id);
    expect((await pedir("GET", `/empleados/${id}`, CONTADOR)).status).toBe(200);
  });

  it("rechaza datos inválidos y duplicados, pero permite los identificadores en otra empresa", async () => {
    expect((await pedir("POST", "/empleados", CONTADOR, datos("INVALIDO", { salario: "-1" }))).status).toBe(
      400,
    );
    expect(
      (await pedir("POST", "/empleados", CONTADOR, datos("INVALIDO", { fechaIngreso: "15/01/2026" }))).status,
    ).toBe(400);
    expect((await pedir("POST", "/empleados", CONTADOR, datos("001"))).status).toBe(409);

    const deOtra = await pedir(
      "POST",
      "/empleados",
      FORASTERO,
      datos("001", { sucursalId: ajena.sucursalId }),
      ajena.empresaId,
    );
    expect(deOtra.status).toBe(201);
  });

  it("edita datos, inactiva sin eliminar y no permite un PATCH vacío", async () => {
    const creado = await pedir("POST", "/empleados", CONTADOR, datos("002"));
    const id = (creado.cuerpo as Record<string, unknown>)["id"] as string;
    expect((await pedir("PATCH", `/empleados/${id}`, CONTADOR, {})).status).toBe(400);
    const editado = await pedir("PATCH", `/empleados/${id}`, CONTADOR, {
      salario: "1000.125",
      area: "",
      activo: false,
    });
    expect(editado.status).toBe(200);
    expect(editado.cuerpo).toMatchObject({ salario: "1000.13", area: null, activo: false });
    expect((await pedir("GET", "/empleados?activo=false", CONTADOR)).cuerpo).toMatchObject([
      { id, activo: false },
    ]);
    expect((await pedir("GET", `/empleados/${id}`, CONTADOR)).status).toBe(200);
  });

  it("limita sucursales y empresas según la membresía", async () => {
    const creado = await pedir("POST", "/empleados", LIMITADO, datos("LIMITADO"));
    expect(creado.status).toBe(201);
    const enOtraSucursal = await pedir(
      "POST",
      "/empleados",
      CONTADOR,
      datos("OTRA-SUCURSAL", { sucursalId: sucursalExtra }),
    );
    expect(enOtraSucursal.status).toBe(201);
    expect(
      (await pedir("POST", "/empleados", LIMITADO, datos("OTRA-SUCURSAL", { sucursalId: sucursalExtra })))
        .status,
    ).toBe(403);
    const empleadosLimitados = (await pedir("GET", "/empleados", LIMITADO)).cuerpo as EmpleadoVista[];
    expect(empleadosLimitados.every((e) => e.sucursalId === esc.sucursalId)).toBe(true);
    expect(empleadosLimitados.some((e) => e.dui === "DUI-OTRA-SUCURSAL")).toBe(false);
    const ajeno = await pedir(
      "POST",
      "/empleados",
      CONTADOR,
      datos("AJENO", { sucursalId: ajena.sucursalId }),
    );
    expect(ajeno.status).toBe(404);
    expect((await pedir("GET", "/empleados", CONTADOR, undefined, ajena.empresaId)).status).toBe(404);
    expect((await pedir("GET", "/empleados", null)).status).toBe(401);
    expect((await pedir("POST", "/empleados", CONSULTA, datos("SIN-PERMISO"))).status).toBe(403);
  });

  it("registra cada alta y cambio en la bitácora", async () => {
    const creado = await pedir("POST", "/empleados", CONTADOR, datos("BITACORA"));
    const id = (creado.cuerpo as Record<string, unknown>)["id"] as string;
    await pedir("PATCH", `/empleados/${id}`, CONTADOR, { puesto: "Contador" });
    const filas = await c.query(
      "select accion, usuario_id from bitacora where empresa_id = $1 and tabla = 'empleados' order by id",
      [esc.empresaId],
    );
    expect(filas.rows.some((f) => f.accion === "INSERT" && f.usuario_id === CONTADOR)).toBe(true);
    expect(filas.rows.some((f) => f.accion === "UPDATE" && f.usuario_id === CONTADOR)).toBe(true);
  });
});
