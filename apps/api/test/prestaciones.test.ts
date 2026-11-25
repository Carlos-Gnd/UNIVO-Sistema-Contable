import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "22222222-2222-4222-8222-222222222222";
const LIMITADO = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";
const CODIGOS_CUENTA = ["2", "21", "2107", "210705", "210706", "210707", "4", "42", "4201", "4202"];
const SUELDOS = ["600.00", "450.00", "450.00", "450.00", "450.00"];
const INGRESOS = ["2025-12-12", "2026-06-12", "2024-12-12", "2023-12-12", "2016-12-12"];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let cuentaGastoId: string;
let cuentaPadreId: string;
let sucursalOtra: string;

async function usuario(id: string, rol: number, empresaId: string, todasSucursales = rol <= 2) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${rol}`,
    `usuario-${id.slice(0, 4)}@prestaciones.test`,
  ]);
  const membresia = await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
    [id, empresaId, rol, todasSucursales],
  );
  return membresia.rows[0]!.id as string;
}

async function agregarCuentas(empresaId: string) {
  for (const codigo of CODIGOS_CUENTA) {
    await c.query(
      "insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) " +
        "select $1, b.codigo, b.nombre, b.naturaleza, b.tipo from catalogo_base b where b.codigo = $2",
      [empresaId, codigo],
    );
  }
}

async function agregarEmpleados() {
  const ids: string[] = [];
  for (const [indice, salario] of SUELDOS.entries()) {
    const fila = await c.query(
      "insert into empleados " +
        "(empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, area, salario, fecha_ingreso) " +
        "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id",
      [
        esc.empresaId,
        esc.sucursalId,
        "Nombre",
        `Empleado ${indice + 1}`,
        `DUI-SINTETICO-${indice + 1}`,
        `NIT-SINTETICO-${indice + 1}`,
        `ISSS-SINTETICO-${indice + 1}`,
        `NUP-SINTETICO-${indice + 1}`,
        `Cargo ${indice + 1}`,
        indice === 0 ? "Administración" : "Ventas",
        salario,
        INGRESOS[indice],
      ],
    );
    ids.push(fila.rows[0]!.id as string);
  }
  return ids;
}

async function pedir(usuarioId: string, cuerpo: unknown, empresaId = esc.empresaId) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}/prestaciones/calcular`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${usuarioId}` },
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

const entrada = (cambios: Record<string, unknown> = {}) => ({
  fechaCalculo: "2026-12-12",
  sucursalId: esc.sucursalId,
  cuentasGastoPorArea: [],
  ...cambios,
});

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_prestaciones");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-740101-101-1");
  ajena = await crearEscenario(c, "0614-740202-101-2");
  await agregarCuentas(esc.empresaId);
  const cuentas = await c.query(
    "select id, codigo from cuentas where empresa_id = $1 and codigo = any($2::text[])",
    [esc.empresaId, ["42", "4201"]],
  );
  cuentaPadreId = cuentas.rows.find((fila) => fila.codigo === "42")!.id as string;
  cuentaGastoId = cuentas.rows.find((fila) => fila.codigo === "4201")!.id as string;
  await agregarEmpleados();

  await usuario(CONTADOR, 2, esc.empresaId);
  await usuario(CONSULTA, 4, esc.empresaId);
  const membresiaLimitada = await usuario(LIMITADO, 3, esc.empresaId, false);
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) select 3, id from permisos where modulo = 'planilla' and accion = 'calcular'",
  );
  const sucursal = await c.query(
    "insert into sucursales (empresa_id, nombre, codigo_establecimiento) " +
      "values ($1, 'Sucursal de prueba', 'S002') returning id",
    [esc.empresaId],
  );
  sucursalOtra = sucursal.rows[0]!.id as string;
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    membresiaLimitada,
    sucursalOtra,
  ]);
  await usuario(FORASTERO, 2, ajena.empresaId);

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

describe("provisión de prestaciones", () => {
  it("calcula las cinco personas y crea la partida de gasto contra pasivos en borrador", async () => {
    const respuesta = await pedir(CONTADOR, entrada());
    expect(respuesta.status).toBe(201);
    expect(respuesta.cuerpo).toMatchObject({
      fechaCalculo: "2026-12-12",
      periodo: "2026-12",
      empleados: [
        { salarioBase: "600.00", diasAguinaldo: "15.00", montoAguinaldo: "300.00" },
        { salarioBase: "450.00", diasServicio: 183, montoAguinaldo: "112.81" },
        { salarioBase: "450.00", diasAguinaldo: "15.00", montoVacaciones: "292.50" },
        { salarioBase: "450.00", diasAguinaldo: "19.00", montoIndemnizacion: "1351.23" },
        { salarioBase: "450.00", diasAguinaldo: "21.00", montoIndemnizacion: "4502.47" },
      ],
      resumen: {
        montoAguinaldo: "1237.81",
        provisionAguinaldoMensual: "112.50",
        montoVacaciones: "684.90",
        provisionVacacionesMensual: "105.64",
        montoIndemnizacion: "7579.32",
        provisionIndemnizacionMensual: "200.00",
        provisionMensualTotal: "418.14",
      },
      partida: {
        fecha: "2026-12-31",
        estado: "borrador",
        origen: "prestaciones",
        concepto: "Provisión de prestaciones del período 2026-12",
        totalDebe: "418.14",
        totalHaber: "418.14",
        cuadra: true,
      },
    });

    const partidaId = (respuesta.cuerpo["partida"] as Record<string, unknown>)["id"] as string;
    const lineas = await c.query(
      `select c.codigo, d.debe::text, d.haber::text from partida_detalles d
       join cuentas c on c.id = d.cuenta_id where d.partida_id = $1 order by d.orden`,
      [partidaId],
    );
    expect(lineas.rows).toEqual([
      { codigo: "4201", debe: "107.50", haber: "0.00" },
      { codigo: "4202", debe: "310.64", haber: "0.00" },
      { codigo: "210705", debe: "0.00", haber: "105.64" },
      { codigo: "210706", debe: "0.00", haber: "112.50" },
      { codigo: "210707", debe: "0.00", haber: "200.00" },
    ]);
    const auditoria = await c.query(
      "select usuario_id from bitacora where empresa_id = $1 and tabla = 'partidas' and registro_id = $2 and accion = 'INSERT'",
      [esc.empresaId, partidaId],
    );
    expect(auditoria.rows).toEqual([{ usuario_id: CONTADOR }]);

    const recalculo = await pedir(CONTADOR, entrada());
    expect(recalculo.status).toBe(201);
    expect((recalculo.cuerpo["partida"] as Record<string, unknown>)["id"]).toBe(partidaId);
  });

  it("rechaza cuentas agrupadoras, datos inválidos, permiso, sucursal y empresa ajena", async () => {
    expect((await pedir(CONTADOR, entrada({ fechaCalculo: "2026-13-40" }))).status).toBe(400);
    await c.query("update empleados set area = 'Operaciones' where dui = 'DUI-SINTETICO-1'");
    expect((await pedir(CONTADOR, entrada())).status).toBe(422);
    expect(
      (
        await pedir(
          CONTADOR,
          entrada({ cuentasGastoPorArea: [{ clave: "operaciones", cuentaGastoId: cuentaPadreId }] }),
        )
      ).status,
    ).toBe(422);
    const asignada = await pedir(
      CONTADOR,
      entrada({ cuentasGastoPorArea: [{ clave: "operaciones", cuentaGastoId }] }),
    );
    expect(asignada.status).toBe(201);
    await c.query("update empleados set area = 'Administración' where dui = 'DUI-SINTETICO-1'");
    expect((await pedir(CONSULTA, entrada())).status).toBe(403);
    expect((await pedir(LIMITADO, entrada({ sucursalId: esc.sucursalId }), esc.empresaId)).status).toBe(403);
    expect((await pedir(CONTADOR, entrada(), ajena.empresaId)).status).toBe(404);
  });

  it("el índice impide duplicar el período en DB", async () => {
    const duplicado = await c
      .query(
        "insert into partidas (empresa_id, sucursal_id, fecha, concepto, origen) " +
          "values ($1, $2, '2026-12-31', 'Provisión repetida', 'prestaciones') returning id",
        [esc.empresaId, esc.sucursalId],
      )
      .catch((e: unknown) => e);
    expect(String((duplicado as Error).message)).toContain("partidas_prestaciones_sucursal_fecha_unq");
  });
});
