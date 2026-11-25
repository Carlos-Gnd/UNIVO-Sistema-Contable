import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  basePropia,
  contabilizar,
  crearEscenario,
  reiniciarBase,
  type Escenario,
} from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "22222222-2222-4222-8222-222222222222";
const LIMITADO = "33333333-3333-4333-8333-333333333333";
const CUENTAS = [
  "2",
  "21",
  "2106",
  "210601",
  "210603",
  "210604",
  "210606",
  "2107",
  "210701",
  "210703",
  "2112",
  "4",
  "42",
  "4201",
  "4202",
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let sucursalLimitada: string;
let cuentaGastoId: string;
let empleadoId: string;

async function usuario(id: string, rol: number, empresaId: string, todasSucursales: boolean) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    "Usuario de prueba",
    "u" + id.slice(0, 4) + "@calculo-planilla.test",
  ]);
  const membresia = await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresaId, rol, todasSucursales],
  );
  return membresia.rows[0]!.id as string;
}

async function agregarCuentas(empresaId: string) {
  for (const codigo of CUENTAS) {
    await c.query(
      "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) " +
        "select $1, b.codigo, b.nombre, b.naturaleza, b.tipo " +
        "from catalogo_base b where b.codigo = $2",
      [empresaId, codigo],
    );
  }
}

async function agregarEmpleado(
  empresaId: string,
  sucursalId: string,
  sufijo: string,
  nit: string,
  salario: string,
) {
  const fila = await c.query(
    "insert into empleados " +
      "(empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, area, salario, fecha_ingreso) " +
      "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '2026-01-15') returning id",
    [
      empresaId,
      sucursalId,
      "Nombre",
      `Empleado ${sufijo}`,
      "DUI-SINTETICO-" + sufijo,
      nit,
      "ISSS-SINTETICO-" + sufijo,
      "NUP-SINTETICO-" + sufijo,
      "Auxiliar " + sufijo,
      "Administración",
      salario,
    ],
  );
  return fila.rows[0]!.id as string;
}

async function pedir(usuarioId: string, cuerpo: unknown, empresaId = esc.empresaId) {
  const respuesta = await fetch(url + "/empresas/" + empresaId + "/planillas/calcular", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + usuarioId },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

const entrada = (cambios: Record<string, unknown> = {}) => ({
  periodo: "2026-11",
  sucursalId: esc.sucursalId,
  cuentasGastoPorArea: [],
  ajustes: [
    {
      empleadoId,
      horasExtra: "3.50",
      diasAusencia: "0.50",
      otrosDescuentos: "40.00",
    },
  ],
  ...cambios,
});

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_calculo_planilla");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-710111-101-1");
  ajena = await crearEscenario(c, "0614-710444-101-4");
  await agregarCuentas(esc.empresaId);
  const cuenta = await c.query("select id from cuentas where empresa_id = $1 and codigo = '4201'", [
    esc.empresaId,
  ]);
  cuentaGastoId = cuenta.rows[0]!.id as string;
  empleadoId = await agregarEmpleado(esc.empresaId, esc.sucursalId, "01", "0614-710222-101-2", "1875.61");
  await agregarEmpleado(esc.empresaId, esc.sucursalId, "02", "06147101111011", "925.00");

  await usuario(CONTADOR, 2, esc.empresaId, true);
  await usuario(CONSULTA, 4, esc.empresaId, false);
  const membresiaLimitada = await usuario(LIMITADO, 3, esc.empresaId, false);
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) " +
      "select 3, id from permisos where modulo = 'planilla' and accion = 'calcular'",
  );
  const nuevaSucursal = await c.query(
    "insert into sucursales (empresa_id, nombre, codigo_establecimiento) " +
      "values ($1, 'Sucursal de prueba', 'S002') returning id",
    [esc.empresaId],
  );
  sucursalLimitada = nuevaSucursal.rows[0]!.id as string;
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    membresiaLimitada,
    sucursalLimitada,
  ]);
  await agregarEmpleado(esc.empresaId, sucursalLimitada, "03", "0614-710333-101-3", "925.00");

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

describe("cálculo de planilla", () => {
  it("calcula los importes sintéticos y crea una partida balanceada en borrador", async () => {
    const respuesta = await pedir(CONTADOR, entrada());
    expect(respuesta.status).toBe(201);
    expect(respuesta.cuerpo).toMatchObject({
      periodo: "2026-11",
      empleados: [
        {
          empleadoId,
          nombres: "Nombre",
          apellidos: "Empleado 01",
          numeroIsss: "ISSS-SINTETICO-01",
          nup: "NUP-SINTETICO-01",
          salarioBase: "1875.61",
          pagoHorasExtra: "54.71",
          descuentoAusencia: "31.26",
          bruto: "1899.06",
          isssLaboral: "30.00",
          afpLaboral: "137.68",
          renta: "227.23",
          isssPatronal: "75.00",
          afpPatronal: "166.17",
          otrosDescuentos: "40.00",
          neto: "1464.15",
        },
      ],
      resumen: { bruto: "1899.06", neto: "1464.15", gastoPatronal: "241.17" },
      partida: {
        fecha: "2026-11-30",
        estado: "borrador",
        origen: "planilla",
        concepto: "Planilla del período 2026-11",
        totalDebe: "2140.23",
        totalHaber: "2140.23",
        cuadra: true,
      },
    });
    const partidaId = (respuesta.cuerpo["partida"] as Record<string, unknown>)["id"] as string;
    const recalculo = await pedir(CONTADOR, entrada());
    expect(recalculo.status).toBe(201);
    expect((recalculo.cuerpo["partida"] as Record<string, unknown>)["id"]).toBe(partidaId);
    const planillas = await c.query(
      "select count(*)::int as total from partidas where empresa_id = $1 and sucursal_id = $2 and fecha = '2026-11-30' and origen = 'planilla'",
      [esc.empresaId, esc.sucursalId],
    );
    expect(planillas.rows).toEqual([{ total: 1 }]);
    const detalle = await c.query(
      "select count(*)::int as total from partida_detalles where partida_id = $1",
      [partidaId],
    );
    expect(detalle.rows).toEqual([{ total: 10 }]);
    const auditoria = await c.query(
      "select usuario_id from bitacora where empresa_id = $1 and tabla = 'partidas' and registro_id = $2 and accion = 'INSERT'",
      [esc.empresaId, partidaId],
    );
    expect(auditoria.rows).toEqual([{ usuario_id: CONTADOR }]);
    await contabilizar(c, partidaId);
    expect((await pedir(CONTADOR, entrada())).status).toBe(409);
  });

  it("valida la solicitud, rechaza permisos insuficientes y oculta empresas ajenas", async () => {
    expect((await pedir(CONTADOR, entrada({ periodo: "2026-13" }))).status).toBe(400);
    expect((await pedir(CONSULTA, entrada())).status).toBe(403);
    expect((await pedir(CONTADOR, entrada(), ajena.empresaId)).status).toBe(404);
    expect(
      (
        await pedir(
          CONTADOR,
          entrada({
            ajustes: [
              {
                empleadoId,
                horasExtra: "0.00",
                diasAusencia: "0.00",
                otrosDescuentos: "2000.00",
              },
            ],
          }),
        )
      ).status,
    ).toBe(422);
  });

  it("respeta el alcance de sucursal del usuario", async () => {
    expect((await pedir(LIMITADO, entrada({ sucursalId: esc.sucursalId, ajustes: [] }))).status).toBe(403);
    expect(
      (
        await pedir(
          LIMITADO,
          entrada({
            sucursalId: sucursalLimitada,
            ajustes: [],
          }),
        )
      ).status,
    ).toBe(201);
  });

  it("exige cuenta para áreas no clasificadas y acepta solo cuentas de gasto imputables de la empresa", async () => {
    await c.query("update empleados set area = 'Operaciones' where id = $1", [empleadoId]);
    const solicitud = entrada({ periodo: "2026-12", ajustes: [] });
    expect((await pedir(CONTADOR, solicitud)).status).toBe(422);
    expect(
      (
        await pedir(CONTADOR, {
          ...solicitud,
          cuentasGastoPorArea: [{ clave: "operaciones", cuentaGastoId: esc.cuentas["110101"] }],
        })
      ).status,
    ).toBe(422);

    const respuesta = await pedir(CONTADOR, {
      ...solicitud,
      cuentasGastoPorArea: [{ clave: "operaciones", cuentaGastoId }],
    });
    expect(respuesta.status).toBe(201);
    const partidaId = (respuesta.cuerpo["partida"] as Record<string, unknown>)["id"] as string;
    const gasto = await c.query(
      "select c.codigo, d.debe::text from partida_detalles d join cuentas c on c.id = d.cuenta_id " +
        "where d.partida_id = $1 and c.codigo = '4201' and d.concepto = 'Sueldos del período'",
      [partidaId],
    );
    expect(gasto.rows).toEqual([{ codigo: "4201", debe: "1875.61" }]);
    await c.query("update empleados set area = 'Administración' where id = $1", [empleadoId]);
  });
});
