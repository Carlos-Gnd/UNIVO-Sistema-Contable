import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const LIMITADO = "22222222-2222-4222-8222-222222222222";
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
let empleadoIds: string[];

async function usuario(id: string, nombre: string, empresaId: string, rol: number, todasSucursales: boolean) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    nombre,
    `u${id.slice(0, 4)}@planillas.test`,
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
        "select $1, b.codigo, b.nombre, b.naturaleza, b.tipo from catalogo_base b where b.codigo = $2",
      [empresaId, codigo],
    );
  }
}

async function agregarEmpleado(indice: number, salario: string) {
  const fila = await c.query(
    "insert into empleados (empresa_id, sucursal_id, nombres, apellidos, dui, nit, numero_isss, nup, puesto, area, salario, fecha_ingreso) " +
      "values ($1, $2, $3, $4, $5, $6, $7, $8, 'Auxiliar', $9, $10, '2026-01-15') returning id",
    [
      esc.empresaId,
      esc.sucursalId,
      `Persona ${indice + 1}`,
      "CheroPhonex",
      `DUI-SINTETICO-${indice + 1}`,
      `NIT-SINTETICO-${indice + 1}`,
      `ISSS-SINTETICO-${indice + 1}`,
      `NUP-SINTETICO-${indice + 1}`,
      indice === 0 ? "Administración" : "Ventas",
      salario,
    ],
  );
  return fila.rows[0]!.id as string;
}

async function pedir(
  metodo: string,
  ruta: string,
  usuarioId: string,
  cuerpo?: unknown,
  empresaId = esc.empresaId,
) {
  const respuesta = await fetch(`${url}/empresas/${empresaId}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", authorization: `Bearer ${usuarioId}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_planillas_oficiales");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-750001-101-1");
  ajena = await crearEscenario(c, "0614-750002-101-2");
  await agregarCuentas(esc.empresaId);
  empleadoIds = [];
  for (const [indice, salario] of ["600.00", "450.00", "450.00", "450.00", "450.00"].entries()) {
    empleadoIds.push(await agregarEmpleado(indice, salario));
  }
  await usuario(CONTADOR, "Contador planillas", esc.empresaId, 2, true);
  const membresia = await usuario(LIMITADO, "Usuario limitado", esc.empresaId, 3, false);
  await c.query(
    "insert into rol_permisos (rol_id, permiso_id) select 3, id from permisos where modulo = 'planilla' and accion in ('ver', 'calcular') on conflict do nothing",
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    membresia,
    esc.sucursalId,
  ]);

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

describe("planillas oficiales de ISSS y AFP", () => {
  it("guarda los importes calculados, presenta cada institución y conserva el histórico", async () => {
    const calculo = await pedir("POST", "/planillas/calcular", CONTADOR, {
      periodo: "2026-10",
      sucursalId: esc.sucursalId,
      ajustes: [],
    });
    expect(calculo.status, JSON.stringify(calculo.cuerpo)).toBe(201);
    const calculoEmpleados = calculo.cuerpo["empleados"] as Record<string, unknown>[];
    expect(calculoEmpleados[0]).toMatchObject({
      nombres: "Persona 1",
      apellidos: "CheroPhonex",
      numeroIsss: "ISSS-SINTETICO-1",
      nup: "NUP-SINTETICO-1",
    });
    expect(calculo.cuerpo).toMatchObject({
      resumen: {
        bruto: "2400.00",
        isssLaboral: "72.00",
        isssPatronal: "180.00",
        afpLaboral: "174.02",
        afpPatronal: "210.02",
      },
    });
    const partidaId = (calculo.cuerpo["partida"] as Record<string, unknown>)["id"] as string;
    const distribucion = await c.query(
      `select c.codigo, d.concepto, d.debe::text
       from partida_detalles d join cuentas c on c.id = d.cuenta_id
       where d.partida_id = $1 and c.codigo in ('4201', '4202')
       order by c.codigo, d.orden`,
      [partidaId],
    );
    expect(distribucion.rows).toEqual([
      { codigo: "4201", concepto: "Sueldos del período", debe: "600.00" },
      { codigo: "4201", concepto: "Aporte patronal ISSS", debe: "45.00" },
      { codigo: "4201", concepto: "Aporte patronal AFP", debe: "52.50" },
      { codigo: "4202", concepto: "Sueldos del período", debe: "1800.00" },
      { codigo: "4202", concepto: "Aporte patronal ISSS", debe: "135.00" },
      { codigo: "4202", concepto: "Aporte patronal AFP", debe: "157.52" },
    ]);

    const consulta = await pedir("GET", "/planillas-oficiales?periodo=2026-10", CONTADOR);
    expect(consulta.status, JSON.stringify(consulta.cuerpo)).toBe(200);
    expect(consulta.cuerpo).toMatchObject({
      periodo: "2026-10",
      totales: {
        isss: { salarioCotizable: "2400.00", laboral: "72.00", patronal: "180.00", total: "252.00" },
        afp: { salarioCotizable: "2400.00", laboral: "174.02", patronal: "210.02", total: "384.04" },
      },
      presentaciones: {},
    });
    const filasReporte = consulta.cuerpo["empleados"] as Record<string, unknown>[];
    expect(filasReporte[0]).toMatchObject({
      nombreCompleto: "Persona 1 CheroPhonex",
      salarioCotizable: "600.00",
    });
    expect(filasReporte.map((fila) => fila["empleadoId"])).toEqual(empleadoIds);

    const presentada = await pedir("POST", "/planillas-oficiales/presentar", CONTADOR, {
      periodo: "2026-10",
      tipo: "isss",
    });
    expect(presentada.status, JSON.stringify(presentada.cuerpo)).toBe(201);
    expect(presentada.cuerpo).toMatchObject({ tipo: "isss", presentadaPor: "Contador planillas" });
    expect(Date.parse(presentada.cuerpo["presentadaEn"] as string)).not.toBeNaN();
    expect(
      (
        await pedir("POST", "/planillas-oficiales/presentar", CONTADOR, {
          periodo: "2026-10",
          tipo: "isss",
        })
      ).status,
    ).toBe(409);

    const vistaPresentada = await pedir("GET", "/planillas-oficiales?periodo=2026-10", CONTADOR);
    expect(vistaPresentada.cuerpo["presentaciones"]).toMatchObject({
      isss: { presentadaPor: "Contador planillas" },
    });
    const afp = await pedir("POST", "/planillas-oficiales/presentar", CONTADOR, {
      periodo: "2026-10",
      tipo: "afp",
    });
    expect(afp.status).toBe(201);

    const recalculo = await pedir("POST", "/planillas/calcular", CONTADOR, {
      periodo: "2026-10",
      sucursalId: esc.sucursalId,
      ajustes: [],
    });
    expect(recalculo.status).toBe(409);
    const bitacora = await c.query(
      "select usuario_id from bitacora where empresa_id = $1 and tabla = 'planillas_presentaciones' and accion = 'INSERT' order by creado_en",
      [esc.empresaId],
    );
    expect(bitacora.rows).toEqual([{ usuario_id: CONTADOR }, { usuario_id: CONTADOR }]);
  });

  it("valida el período, requiere datos previos y limita empresa y sucursales", async () => {
    expect((await pedir("GET", "/planillas-oficiales?periodo=2026-13", CONTADOR)).status).toBe(400);
    expect(
      (
        await pedir("POST", "/planillas-oficiales/presentar", CONTADOR, {
          periodo: "2026-09",
          tipo: "afp",
        })
      ).status,
    ).toBe(422);
    expect(
      (await pedir("GET", "/planillas-oficiales?periodo=2026-10", CONTADOR, undefined, ajena.empresaId))
        .status,
    ).toBe(404);
    expect((await pedir("GET", "/planillas-oficiales?periodo=2026-10", LIMITADO)).status).toBe(403);
    expect(
      (
        await pedir("POST", "/planillas-oficiales/presentar", LIMITADO, {
          periodo: "2026-10",
          tipo: "afp",
        })
      ).status,
    ).toBe(403);
  });
});
