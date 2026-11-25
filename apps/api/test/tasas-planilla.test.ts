import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { calcularRetencionesPlanilla, type ConfiguracionPlanillaVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "22222222-2222-4222-8222-222222222222";
const OTRA_EMPRESA = "33333333-3333-4333-8333-333333333333";
const TABLA_INICIAL = [
  { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuotaFija: "0.00" },
  { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuotaFija: "17.67" },
  { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuotaFija: "60.00" },
  { desde: "2038.10", hasta: null, porcentaje: "30.00", cuotaFija: "288.57" },
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;

async function usuario(id: string, rol: number, empresaId: string) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${rol}`,
    `u${id.slice(0, 4)}@tasas.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, empresaId, rol, rol <= 2],
  );
}

async function pedir(metodo: string, empresaId: string, usuarioId: string | null, cuerpo?: unknown) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}/tasas-planilla`, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      ...(usuarioId ? { authorization: `Bearer ${usuarioId}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as unknown };
}

function datos(vigenteDesde: string, cambios: Record<string, unknown> = {}) {
  return {
    vigenteDesde,
    tasaIsssLaboral: "3.00",
    tasaIsssPatronal: "7.50",
    techoIsss: "1000.00",
    tasaAfpLaboral: "7.25",
    tasaAfpPatronal: "8.75",
    tramos: TABLA_INICIAL,
    ...cambios,
  };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_tasas_planilla");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-730001-101-1");
  ajena = await crearEscenario(c, "0614-730002-101-2");
  await usuario(ADMIN, 1, esc.empresaId);
  await usuario(CONSULTA, 4, esc.empresaId);
  await usuario(OTRA_EMPRESA, 1, ajena.empresaId);

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({
      verificarToken: async (token: string) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
    })
    .compile();
  app = modulo.createNestApplication({ logger: ["error"] });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("tasas de planilla", () => {
  it("consulta valores iniciales y oculta empresas sin membresía", async () => {
    const respuesta = await pedir("GET", esc.empresaId, ADMIN);
    expect(respuesta.status).toBe(200);
    expect(respuesta.cuerpo).toMatchObject([
      {
        vigenteDesde: "2026-01-01",
        tasaIsssLaboral: "3.00",
        tasaIsssPatronal: "7.50",
        techoIsss: "1000.00",
        tasaAfpLaboral: "7.25",
        tasaAfpPatronal: "8.75",
        tramos: [
          { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuotaFija: "0.00" },
          { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuotaFija: "17.67" },
          { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuotaFija: "60.00" },
          { desde: "2038.10", hasta: null, porcentaje: "30.00", cuotaFija: "288.57" },
        ],
      },
    ]);
    expect((await pedir("GET", esc.empresaId, OTRA_EMPRESA)).status).toBe(404);
    expect((await pedir("GET", ajena.empresaId, ADMIN)).status).toBe(404);
  });

  it("valida rangos y tramos, y rechaza una vigencia duplicada", async () => {
    expect(
      (await pedir("POST", esc.empresaId, ADMIN, datos("2027-01-01", { tasaAfpLaboral: "101" }))).status,
    ).toBe(400);
    expect(
      (
        await pedir(
          "POST",
          esc.empresaId,
          ADMIN,
          datos("2027-01-01", {
            tramos: [TABLA_INICIAL[0], { ...TABLA_INICIAL[1]!, desde: "551.00" }, ...TABLA_INICIAL.slice(2)],
          }),
        )
      ).status,
    ).toBe(400);
    expect((await pedir("POST", esc.empresaId, ADMIN, datos("2027-01-01", { tramos: [] }))).status).toBe(400);
    const version = await pedir("POST", esc.empresaId, ADMIN, datos("2027-01-01"));
    expect(version.status, JSON.stringify(version.cuerpo)).toBe(201);
    expect((await pedir("POST", esc.empresaId, ADMIN, datos("2027-01-01"))).status).toBe(409);
  });

  it("aplica la tasa nueva al cálculo y registra quién la cambió en bitácora", async () => {
    const inicial = (
      (await pedir("GET", ajena.empresaId, OTRA_EMPRESA)).cuerpo as ConfiguracionPlanillaVista[]
    )[0]!;
    const calculoInicial = calcularRetencionesPlanilla("2400.00", inicial);
    expect({
      isssLaboral: calculoInicial.isssLaboral.aTexto(),
      afpLaboral: calculoInicial.afpLaboral.aTexto(),
      renta: calculoInicial.renta.aTexto(),
      neto: calculoInicial.neto.aTexto(),
    }).toEqual({ isssLaboral: "30.00", afpLaboral: "174.00", renta: "335.94", neto: "1860.06" });

    const creada = await pedir(
      "POST",
      ajena.empresaId,
      OTRA_EMPRESA,
      datos("2027-01-01", { tasaIsssLaboral: "4.00" }),
    );
    expect(creada.status, JSON.stringify(creada.cuerpo)).toBe(201);
    const nueva = creada.cuerpo as ConfiguracionPlanillaVista;
    const calculoNuevo = calcularRetencionesPlanilla("2400.00", nueva);
    expect({ isssLaboral: calculoNuevo.isssLaboral.aTexto(), neto: calculoNuevo.neto.aTexto() }).toEqual({
      isssLaboral: "40.00",
      neto: "1853.06",
    });
    const historial = (await pedir("GET", ajena.empresaId, OTRA_EMPRESA))
      .cuerpo as ConfiguracionPlanillaVista[];
    expect(historial.map((v) => v.vigenteDesde)).toEqual(["2027-01-01", "2026-01-01"]);

    const auditado = await c.query(
      "select usuario_id from bitacora where empresa_id = $1 and tabla = 'configuraciones_planilla' and registro_id = $2 and accion = 'INSERT'",
      [ajena.empresaId, nueva.id],
    );
    expect(auditado.rows).toEqual([{ usuario_id: OTRA_EMPRESA }]);
  });

  it("exige permiso administrativo para consultar o cambiar tasas", async () => {
    expect((await pedir("GET", esc.empresaId, CONSULTA)).status).toBe(403);
    expect((await pedir("POST", esc.empresaId, CONSULTA, datos("2027-02-01"))).status).toBe(403);
    expect((await pedir("GET", esc.empresaId, null)).status).toBe(401);
  });
});
