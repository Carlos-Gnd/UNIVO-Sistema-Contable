// Registro de activos fijos (HU-81, S3-T129): el alta genera su partida contabilizada y el activo aparece en el
// balance general; la baja retira el costo con su pérdida; las reglas de cuentas, permisos y períodos se respetan.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  ActivoFijoVista,
  BalanceGeneral,
  ResultadoAltaActivo,
  ResultadoBajaActivo,
} from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cargarCasoCherophonex, type CasoCargado } from "../../../packages/db/src/casos/cherophonex";
import { basePropia, reiniciarBase } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222"; // registra activos, pero solo en la sucursal nueva
const CONSULTA = "44444444-4444-4444-8444-444444444444"; // solo ve
const AJENO = "33333333-3333-4333-8333-333333333333";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let carga: CasoCargado;
let sucursalNueva: string;

async function llamar<T>(metodo: "GET" | "POST" | "PUT", ruta: string, cuerpo?: unknown, usuario = CONTADOR) {
  const r = await fetch(`${url}/empresas/${carga.empresaId}${ruta}`, {
    method: metodo,
    headers: { authorization: `Bearer ${usuario}`, "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { status: r.status, cuerpo: (await r.json()) as T };
}

const balance = (fecha: string) => llamar<BalanceGeneral>("GET", `/estados/balance-general?fecha=${fecha}`);
const nuevo = (extra: Record<string, unknown> = {}) => ({
  nombre: "Laptop de contabilidad",
  categoria: "mobiliario_equipo",
  sucursalId: carga.sucursalId,
  costo: "1200.00",
  valorResidual: "0",
  fechaAdquisicion: "2026-11-05",
  vidaUtilAnios: 3,
  contrapartidaId: carga.cuentas["11010301"],
  ...extra,
});

async function lineasDe(partidaId: string) {
  const r = await c.query<{ codigo: string; debe: string; haber: string }>(
    `select c.codigo, d.debe::text, d.haber::text from partida_detalles d join cuentas c on c.id = d.cuenta_id
     where d.partida_id = $1 order by d.orden`,
    [partidaId],
  );
  return r.rows;
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_activos_fijos");
  c = await reiniciarBase(urlBase);
  carga = await cargarCasoCherophonex(c);
  const s = await c.query<{ id: string }>(
    `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Sucursal Usulután', 'S002') returning id`,
    [carga.empresaId],
  );
  sucursalNueva = s.rows[0]!.id;
  for (const [id, nombre] of [
    [CONTADOR, "Contador"],
    [AUXILIAR, "Auxiliar"],
    [CONSULTA, "Consulta"],
    [AJENO, "Ajeno"],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      nombre,
      `${nombre.toLowerCase()}@prueba.sv`,
    ]);
  }
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 2, true)",
    [CONTADOR, carga.empresaId],
  );
  const mc = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 4, false) returning id",
    [CONSULTA, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2), ($1, $3)", [
    mc.rows[0]!.id,
    carga.sucursalId,
    sucursalNueva,
  ]);
  const m = await c.query<{ id: string }>(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, 3, false) returning id",
    [AUXILIAR, carga.empresaId],
  );
  await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
    m.rows[0]!.id,
    sucursalNueva,
  ]);

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

describe("alta de un activo fijo (S3-T127)", () => {
  let alta: ResultadoAltaActivo;
  let antes: BalanceGeneral;

  beforeAll(async () => {
    antes = (await balance("2026-11-30")).cuerpo;
    const r = await llamar<ResultadoAltaActivo>("POST", "/activos-fijos", nuevo());
    expect(r.status).toBe(201);
    alta = r.cuerpo;
  });

  it("asigna el código AF-0001 y las cuentas del catálogo según la categoría", () => {
    expect(alta.activo).toMatchObject({
      codigo: "AF-0001",
      estado: "activo",
      costo: "1200.00",
      depreciacionAcumulada: "0.00",
      valorEnLibros: "1200.00",
      tasaAnual: "33.33",
      cuentaActivo: { codigo: "120105" },
      cuentaDepreciacion: { codigo: "120204" },
      cuentaGasto: { codigo: "420122" },
    });
  });

  it("genera la partida de adquisición ya contabilizada: costo al debe del activo y al haber de bancos", async () => {
    expect(alta.partida?.numero).toBeGreaterThan(0);
    expect(alta.activo.partidaAltaId).toBe(alta.partida?.id);
    expect(await lineasDe(alta.partida!.id)).toEqual([
      { codigo: "120105", debe: "1200.00", haber: "0.00" },
      { codigo: "11010301", debe: "0.00", haber: "1200.00" },
    ]);
    const p = await c.query(`select estado, origen, origen_id, fecha::text from partidas where id = $1`, [
      alta.partida!.id,
    ]);
    expect(p.rows[0]).toMatchObject({
      estado: "contabilizada",
      origen: "activo_fijo",
      origen_id: alta.activo.id,
    });
  });

  it("el activo aparece en el balance general como activo no corriente (y el efectivo baja)", async () => {
    const despues = (await balance("2026-11-30")).cuerpo;
    const subio = (a: string, b: string) => (Number(a) - Number(b)).toFixed(2);
    expect(subio(despues.activoNoCorriente.total, antes.activoNoCorriente.total)).toBe("1200.00");
    expect(subio(antes.activoCorriente.total, despues.activoCorriente.total)).toBe("1200.00");
    expect(despues.totalActivo).toBe(antes.totalActivo);
    expect(despues.cuadra).toBe(true);
  });

  it("queda en la bitácora a nombre de quien lo registró", async () => {
    const r = await c.query(
      `select usuario_id from bitacora where tabla = 'activos_fijos' and registro_id = $1 and accion = 'INSERT'`,
      [alta.activo.id],
    );
    expect(r.rows[0]?.usuario_id).toBe(CONTADOR);
  });

  it("sin contrapartida solo registra el activo (ya estaba en los saldos iniciales)", async () => {
    const before = await c.query<{ n: string }>("select count(*)::text as n from partidas");
    const r = await llamar<ResultadoAltaActivo>(
      "POST",
      "/activos-fijos",
      nuevo({
        nombre: "Escritorios",
        contrapartidaId: undefined,
        fechaAdquisicion: "2026-10-01",
        vidaUtilAnios: 2,
      }),
    );
    expect(r.status).toBe(201);
    expect(r.cuerpo.partida).toBeNull();
    expect(r.cuerpo.activo.codigo).toBe("AF-0002");
    const despues = await c.query<{ n: string }>("select count(*)::text as n from partidas");
    expect(despues.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it("lista los activos de la empresa; quien solo consulta puede verlos", async () => {
    const r = await llamar<ActivoFijoVista[]>("GET", "/activos-fijos", undefined, CONSULTA);
    expect(r.status).toBe(200);
    expect(r.cuerpo.map((a) => a.codigo)).toEqual(["AF-0001", "AF-0002"]);
  });
});

describe("validaciones y permisos", () => {
  it("rechaza una vida útil menor a la que permite el porcentaje fiscal de la categoría", async () => {
    const r = await llamar<{ errores: Record<string, string[]> }>(
      "POST",
      "/activos-fijos",
      nuevo({ categoria: "equipo_transporte", vidaUtilAnios: 2 }),
    );
    expect(r.status).toBe(400);
    expect(r.cuerpo.errores["vidaUtilAnios"]?.[0]).toContain("mínima");
  });

  it("rechaza un valor residual igual o mayor al costo", async () => {
    expect((await llamar("POST", "/activos-fijos", nuevo({ valorResidual: "1200" }))).status).toBe(400);
  });

  it("exige una cuenta de último nivel (la 1201 tiene subcuentas)", async () => {
    const r = await llamar("POST", "/activos-fijos", nuevo({ cuentaActivoId: carga.cuentas["1201"] }));
    expect(r.status).toBe(400);
  });

  it("quien solo consulta no registra (403) y un ajeno a la empresa no la ve (404)", async () => {
    expect((await llamar("POST", "/activos-fijos", nuevo(), CONSULTA)).status).toBe(403);
    expect((await llamar("GET", "/activos-fijos", undefined, AJENO)).status).toBe(404);
  });

  it("el auxiliar solo registra en las sucursales que ve", async () => {
    expect((await llamar("POST", "/activos-fijos", nuevo(), AUXILIAR)).status).toBe(403);
    const ok = await llamar<ResultadoAltaActivo>(
      "POST",
      "/activos-fijos",
      nuevo({ sucursalId: sucursalNueva, nombre: "Aire acondicionado", contrapartidaId: undefined }),
      AUXILIAR,
    );
    expect(ok.status).toBe(201);
    const suyos = await llamar<ActivoFijoVista[]>("GET", "/activos-fijos", undefined, AUXILIAR);
    expect(suyos.cuerpo.map((a) => a.nombre)).toEqual(["Aire acondicionado"]);
  });

  it("si el período está cerrado, la partida se rechaza (422) y el activo tampoco queda registrado", async () => {
    await c.query(
      `update periodos set estado = 'cerrado' where empresa_id = $1 and mes = 2 and ejercicio_id in (select id from ejercicios where empresa_id = $1 and anio = 2026)`,
      [carga.empresaId],
    );
    const antes = await c.query<{ n: string }>("select count(*)::text as n from activos_fijos");
    const r = await llamar("POST", "/activos-fijos", nuevo({ fechaAdquisicion: "2026-02-10" }));
    expect(r.status).toBe(422);
    const despues = await c.query<{ n: string }>("select count(*)::text as n from activos_fijos");
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);
  });
});

describe("baja de un activo", () => {
  let id: string;
  let baja: ResultadoBajaActivo;

  beforeAll(async () => {
    const a = await llamar<ResultadoAltaActivo>(
      "POST",
      "/activos-fijos",
      nuevo({ nombre: "Impresora", costo: "300.00", fechaAdquisicion: "2026-11-10", vidaUtilAnios: 2 }),
    );
    id = a.cuerpo.activo.id;
  });

  it("genera la partida de baja: retira el costo y registra la pérdida", async () => {
    const r = await llamar<ResultadoBajaActivo>("POST", `/activos-fijos/${id}/baja`, { fecha: "2026-11-20" });
    expect(r.status).toBe(200);
    baja = r.cuerpo;
    expect(baja.activo).toMatchObject({
      estado: "de_baja",
      fechaBaja: "2026-11-20",
      partidaBajaId: baja.partida.id,
    });
    expect(await lineasDe(baja.partida.id)).toEqual([
      { codigo: "4301", debe: "300.00", haber: "0.00" },
      { codigo: "120105", debe: "0.00", haber: "300.00" },
    ]);
  });

  it("con depreciación acumulada, la cancela y solo el valor en libros va a pérdida", async () => {
    const a = await llamar<ResultadoAltaActivo>(
      "POST",
      "/activos-fijos",
      nuevo({ nombre: "Monitor", costo: "400.00", fechaAdquisicion: "2026-11-02", vidaUtilAnios: 2 }),
    );
    await c.query(
      "update activos_fijos set depreciacion_acumulada = 100, ultimo_mes_depreciado = '2026-11-01' where id = $1",
      [a.cuerpo.activo.id],
    );
    const r = await llamar<ResultadoBajaActivo>("POST", `/activos-fijos/${a.cuerpo.activo.id}/baja`, {
      fecha: "2026-11-25",
    });
    expect(r.status).toBe(200);
    expect(await lineasDe(r.cuerpo.partida.id)).toEqual([
      { codigo: "120204", debe: "100.00", haber: "0.00" },
      { codigo: "4301", debe: "300.00", haber: "0.00" },
      { codigo: "120105", debe: "0.00", haber: "400.00" },
    ]);
  });

  it("no se da de baja dos veces (409) ni antes de adquirirlo (400)", async () => {
    expect((await llamar("POST", `/activos-fijos/${id}/baja`, { fecha: "2026-11-21" })).status).toBe(409);
    const otro = await llamar<ResultadoAltaActivo>("POST", "/activos-fijos", nuevo({ nombre: "Teléfono" }));
    const r = await llamar("POST", `/activos-fijos/${otro.cuerpo.activo.id}/baja`, { fecha: "2026-11-01" });
    expect(r.status).toBe(400);
  });

  it("un activo dado de baja no admite cambios en la base", async () => {
    await expect(c.query("update activos_fijos set nombre = 'otro' where id = $1", [id])).rejects.toThrow(
      /dado de baja/,
    );
  });

  it("el balance cuadra después de las altas y bajas", async () => {
    expect((await balance("2026-11-30")).cuerpo.cuadra).toBe(true);
  });
});

describe("las partidas de activo fijo no se anulan ni se editan desde contabilidad", () => {
  let partidaId: string;
  beforeAll(async () => {
    const a = await llamar<ResultadoAltaActivo>(
      "POST",
      "/activos-fijos",
      nuevo({ nombre: "Router", costo: "90.00" }),
    );
    partidaId = a.cuerpo.partida!.id;
  });

  it("anularla se rechaza (422) y la partida sigue contabilizada", async () => {
    const r = await llamar<{ message: string }>("POST", `/partidas/${partidaId}/anular`, {
      motivo: "Prueba",
    });
    expect(r.status).toBe(422);
    expect(r.cuerpo.message).toContain("activos fijos");
    const p = await c.query("select estado from partidas where id = $1", [partidaId]);
    expect(p.rows[0]?.estado).toBe("contabilizada");
  });

  it("editarla se rechaza (422)", async () => {
    const lineas = [
      { cuentaId: carga.cuentas["120105"], debe: "95.00", haber: "0" },
      { cuentaId: carga.cuentas["11010301"], debe: "0", haber: "95.00" },
    ];
    const r = await llamar<unknown>("PUT", `/partidas/${partidaId}/contabilizada`, {
      sucursalId: carga.sucursalId,
      fecha: "2026-11-05",
      tipo: "operacion",
      concepto: "Editada",
      lineas,
    });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.cuerpo)).toContain("activos fijos");
    expect(await lineasDe(partidaId)).toEqual([
      { codigo: "120105", debe: "90.00", haber: "0.00" },
      { codigo: "11010301", debe: "0.00", haber: "90.00" },
    ]);
  });

  it("la cuenta del activo debe ser de clase 1 y la del gasto de clase 4", async () => {
    expect(
      (await llamar("POST", "/activos-fijos", nuevo({ cuentaActivoId: carga.cuentas["5101"] }))).status,
    ).toBe(400);
    expect(
      (await llamar("POST", "/activos-fijos", nuevo({ cuentaGastoId: carga.cuentas["120105"] }))).status,
    ).toBe(400);
  });

  it("la baja sigue siendo el camino", async () => {
    const id = (await c.query("select id from activos_fijos where partida_alta_id = $1", [partidaId])).rows[0]
      .id;
    expect((await llamar("POST", `/activos-fijos/${id}/baja`, { fecha: "2026-11-25" })).status).toBe(200);
  });
});
