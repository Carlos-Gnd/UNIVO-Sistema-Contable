// Clientes y proveedores (HU-58, S3-T58 y S3-T60): validación de NIT y NRC, unicidad por empresa y permisos.
// Usa una base propia (contable_api_terceros) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { TerceroVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
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

async function pedir(
  metodo: string,
  ruta: string,
  usuario: string | null,
  cuerpo?: unknown,
  empresa = esc.empresaId,
) {
  const r = await fetch(`${url}/empresas/${empresa}${ruta}`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuario ? { authorization: `Bearer ${usuario}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const tercero = (cuerpo: Record<string, unknown> = {}) => ({
  nombre: "Tecno Plaza San Miguel, S.A. de C.V.",
  nit: "1234-567890-123-0",
  nrc: "245871-4",
  actividadEconomica: "Venta de equipo de telefonía",
  clasificacion: "mediano",
  esCliente: true,
  ...cuerpo,
});

async function usuario(id: string, rol: number, empresaId: string) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3) on conflict do nothing", [
    id,
    `Usuario ${rol}`,
    `u${id.slice(0, 4)}@terceros.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, empresaId, rol, rol <= 2],
  );
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_terceros");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  ajena = await crearEscenario(c, "0614-010190-102-0");
  await usuario(CONTADOR, 2, esc.empresaId);
  await usuario(AUXILIAR, 3, esc.empresaId);
  await usuario(CONSULTA, 4, esc.empresaId);
  await usuario(FORASTERO, 2, ajena.empresaId);

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

describe("clientes y proveedores", () => {
  it("se crean con el NIT y el NRC con formato, y se listan por rol", async () => {
    const r = await pedir("POST", "/terceros", AUXILIAR, tercero({ nit: "12345678901230", nrc: "2458714" }));
    expect(r.status).toBe(201);
    expect(r.cuerpo).toMatchObject({
      nit: "1234-567890-123-0",
      nrc: "245871-4",
      clasificacion: "mediano",
      esCliente: true,
      esProveedor: false,
      activo: true,
    });
    const prov = await pedir(
      "POST",
      "/terceros",
      CONTADOR,
      tercero({
        nombre: "Totalynk El Salvador",
        nit: "0000-000000-104-0",
        nrc: "123456-7",
        esCliente: false,
        esProveedor: true,
        clasificacion: "grande",
      }),
    );
    expect(prov.status).toBe(201);

    const clientes = (await pedir("GET", "/terceros?rol=cliente", CONSULTA))
      .cuerpo as unknown as TerceroVista[];
    expect(clientes.map((t) => t.nombre)).toEqual(["Tecno Plaza San Miguel, S.A. de C.V."]);
    const proveedores = (await pedir("GET", "/terceros?rol=proveedor", CONSULTA))
      .cuerpo as unknown as TerceroVista[];
    expect(proveedores.map((t) => t.nombre)).toEqual(["Totalynk El Salvador"]);
    const buscados = (await pedir("GET", "/terceros?busqueda=245871", CONSULTA))
      .cuerpo as unknown as TerceroVista[];
    expect(buscados).toHaveLength(1);
  });

  it("rechaza un NIT con dígito verificador incorrecto, un NRC mal formado y un tercero sin rol", async () => {
    const nit = await pedir("POST", "/terceros", CONTADOR, tercero({ nit: "1234-567890-123-1" }));
    expect(nit.status).toBe(400);
    expect(JSON.stringify(nit.cuerpo)).toMatch(/dígito verificador/);
    expect(
      (await pedir("POST", "/terceros", CONTADOR, tercero({ nit: "0614-010190-100-0", nrc: "abc" }))).status,
    ).toBe(400);
    expect(
      (await pedir("POST", "/terceros", CONTADOR, tercero({ nit: "0614-010190-100-0", esCliente: false })))
        .status,
    ).toBe(400);
  });

  it("el NIT y el NRC son únicos por empresa", async () => {
    const igualNit = await pedir("POST", "/terceros", CONTADOR, tercero({ nrc: "999999-9" }));
    expect(igualNit.status).toBe(409);
    expect(igualNit.cuerpo["message"]).toMatch(/NIT/);
    const igualNrc = await pedir("POST", "/terceros", CONTADOR, tercero({ nit: "12345678-4" }));
    expect(igualNrc.status).toBe(409);
    expect(igualNrc.cuerpo["message"]).toMatch(/NRC/);
    // otra empresa sí puede registrar los mismos datos
    expect((await pedir("POST", "/terceros", FORASTERO, tercero(), ajena.empresaId)).status).toBe(201);
  });

  it("se editan, se inactivan y no se ven desde otra empresa", async () => {
    const lista = (await pedir("GET", "/terceros", CONTADOR)).cuerpo as unknown as TerceroVista[];
    const cliente = lista.find((t) => t.esCliente)!;
    const editado = await pedir("PATCH", `/terceros/${cliente.id}`, CONTADOR, {
      esProveedor: true,
      diasCredito: 30,
      telefono: "2661-0000",
    });
    expect(editado.status).toBe(200);
    expect(editado.cuerpo).toMatchObject({ esCliente: true, esProveedor: true, diasCredito: 30 });
    expect((await pedir("PATCH", `/terceros/${cliente.id}`, CONTADOR, {})).status).toBe(400);
    expect(
      (await pedir("PATCH", `/terceros/${cliente.id}`, CONTADOR, { esCliente: false, esProveedor: false }))
        .status,
    ).toBe(422);
    expect(
      (await pedir("PATCH", `/terceros/${cliente.id}`, CONTADOR, { nit: "0000-000000-104-0" })).status,
    ).toBe(409);
    expect(
      (await pedir("PATCH", `/terceros/${cliente.id}`, CONTADOR, { activo: false })).cuerpo,
    ).toMatchObject({ activo: false });
    const activos = (await pedir("GET", "/terceros?activo=true", CONTADOR))
      .cuerpo as unknown as TerceroVista[];
    expect(activos.map((t) => t.id)).not.toContain(cliente.id);
    // otra empresa: 404 al pedirlo con su propia membresía
    expect(
      (await pedir("GET", `/terceros/${cliente.id}`, FORASTERO, undefined, ajena.empresaId)).status,
    ).toBe(404);
  });

  it("permisos: consulta solo ve; quien no es miembro no entra; los cambios quedan en la bitácora", async () => {
    expect((await pedir("POST", "/terceros", CONSULTA, tercero({ nit: "0000-000000-011-5" }))).status).toBe(
      403,
    );
    expect((await pedir("GET", "/terceros", FORASTERO)).status).toBe(404);
    expect((await pedir("GET", "/terceros", null)).status).toBe(401);
    const b = await c.query(
      `select usuario_id from bitacora where tabla = 'terceros' and accion = 'INSERT' order by id limit 1`,
    );
    expect([AUXILIAR, CONTADOR]).toContain(b.rows[0].usuario_id);
  });
});
