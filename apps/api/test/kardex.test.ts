// Kardex (HU-65, S3-T79 a S3-T81): entradas y salidas, costo promedio y PEPS al centavo, existencias y permisos.
// Usa una base propia (contable_api_kardex) para correr en paralelo con las demás pruebas.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { KardexVista, MovimientoInventarioVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR_MATRIZ = "22222222-2222-4222-8222-222222222222";
const AUXILIAR_USULUTAN = "33333333-3333-4333-8333-333333333333";
const CONSULTA = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let usulutanId: string;
let n = 0;

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

async function nuevoProducto(
  extra: Record<string, unknown> = {},
  empresa = esc.empresaId,
  usuario = CONTADOR,
) {
  const r = await pedir(
    "POST",
    "/productos",
    usuario,
    { codigo: `K-${++n}`, nombre: `Producto ${n}`, ...extra },
    empresa,
  );
  expect(r.status).toBe(201);
  return r.cuerpo["id"] as string;
}

const mover = (
  productoId: string,
  tipo: "entrada" | "salida",
  cantidad: number | string,
  fecha: string,
  extra: Record<string, unknown> = {},
  usuario: string = CONTADOR,
) =>
  pedir("POST", "/movimientos-inventario", usuario, {
    productoId,
    sucursalId: esc.sucursalId,
    tipo,
    cantidad,
    fecha,
    ...(tipo === "entrada" ? { costoUnitario: "10" } : {}),
    ...extra,
  });

const kardex = async (productoId: string, filtros = "", usuario = CONTADOR) => {
  const r = await pedir(
    "GET",
    `/productos/${productoId}/kardex?sucursalId=${esc.sucursalId}${filtros}`,
    usuario,
  );
  return { status: r.status, cuerpo: r.cuerpo as unknown as KardexVista & Record<string, unknown> };
};

async function usuario(id: string, rol: number, sucursal: string | null) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `U${rol}`,
    `u${id.slice(0, 4)}@kardex.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, esc.empresaId, rol, sucursal === null],
  );
  if (sucursal) {
    await c.query(
      "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
      [id, sucursal, esc.empresaId],
    );
  }
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_kardex");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  ajena = await crearEscenario(c, "0614-010190-102-0");
  usulutanId = (
    await c.query(
      `insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id`,
      [esc.empresaId],
    )
  ).rows[0].id as string;
  await usuario(CONTADOR, 2, null);
  await usuario(AUXILIAR_MATRIZ, 3, esc.sucursalId);
  await usuario(AUXILIAR_USULUTAN, 3, usulutanId);
  await usuario(CONSULTA, 4, esc.sucursalId);

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

describe("registro de movimientos", () => {
  it("una entrada guarda su costo; una salida se valúa y devuelve las existencias que quedan", async () => {
    const p = await nuevoProducto();
    const entrada = await mover(p, "entrada", 8, "2026-10-01", { costoUnitario: "590" });
    expect(entrada.status).toBe(201);
    expect(entrada.cuerpo).toMatchObject({
      costoTotal: "4720.00",
      saldo: { cantidad: "8.0000", costoTotal: "4720.00", costoUnitario: "590.0000" },
    });
    const salida = (await mover(p, "salida", 2, "2026-10-08")).cuerpo as unknown as MovimientoInventarioVista;
    expect(salida).toMatchObject({ costoUnitario: "590.0000", costoTotal: "1180.00" });
    expect(salida.saldo).toEqual({ cantidad: "6.0000", costoTotal: "3540.00", costoUnitario: "590.0000" });
  });

  it("una entrada sin costo unitario o con cantidad inválida se rechaza", async () => {
    const p = await nuevoProducto();
    expect((await mover(p, "entrada", 1, "2026-10-01", { costoUnitario: undefined })).status).toBe(400);
    expect((await mover(p, "entrada", 0, "2026-10-01")).status).toBe(400);
    expect((await mover(p, "entrada", "1.23456", "2026-10-01")).status).toBe(400);
    expect((await mover(p, "entrada", 1, "01/10/2026")).status).toBe(400);
  });

  it("no permite sacar más de lo que hay ni registrar un movimiento anterior al último", async () => {
    const p = await nuevoProducto();
    await mover(p, "entrada", 5, "2026-10-10");
    const mucho = await mover(p, "salida", 6, "2026-10-11");
    expect(mucho.status).toBe(422);
    expect(mucho.cuerpo["message"]).toMatch(/Existencia insuficiente/);
    const antes = await mover(p, "entrada", 1, "2026-10-09");
    expect(antes.status).toBe(422);
    expect(antes.cuerpo["message"]).toMatch(/anterior al último/);
    expect((await kardex(p)).cuerpo.saldoFinal.cantidad).toBe("5.0000");
  });

  it("un producto inactivo no recibe movimientos", async () => {
    const p = await nuevoProducto();
    await pedir("PATCH", `/productos/${p}`, CONTADOR, { activo: false });
    expect((await mover(p, "entrada", 1, "2026-10-01")).status).toBe(422);
  });

  it("dos salidas simultáneas no dejan existencias negativas", async () => {
    const p = await nuevoProducto();
    await mover(p, "entrada", 10, "2026-10-01");
    const [a, b] = await Promise.all([
      mover(p, "salida", 6, "2026-10-02"),
      mover(p, "salida", 6, "2026-10-02"),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    expect((await kardex(p)).cuerpo.saldoFinal.cantidad).toBe("4.0000");
  });
});

describe("valuación: promedio ponderado y PEPS", () => {
  const preparar = async (metodo?: "peps" | "promedio_ponderado") => {
    const p = await nuevoProducto(metodo ? { metodoValuacion: metodo } : {});
    await mover(p, "entrada", 10, "2026-10-01", { costoUnitario: "10" });
    await mover(p, "entrada", 10, "2026-10-02", { costoUnitario: "12" });
    await mover(p, "salida", 15, "2026-10-03");
    return p;
  };

  it("sin método propio usa el de la empresa (promedio ponderado)", async () => {
    const k = (await kardex(await preparar())).cuerpo;
    expect(k.metodo).toBe("promedio_ponderado");
    // promedio 11.00: 15 unidades salen por 165.00 y quedan 5 por 55.00
    expect(k.totales.salidaTotal).toBe("165.00");
    expect(k.saldoFinal).toEqual({ cantidad: "5.0000", costoTotal: "55.00", costoUnitario: "11.0000" });
  });

  it("con PEPS salen primero las entradas más antiguas", async () => {
    const k = (await kardex(await preparar("peps"))).cuerpo;
    expect(k.metodo).toBe("peps");
    // 10 a 10.00 y 5 a 12.00 = 160.00; quedan 5 a 12.00
    expect(k.totales.salidaTotal).toBe("160.00");
    expect(k.saldoFinal).toEqual({ cantidad: "5.0000", costoTotal: "60.00", costoUnitario: "12.0000" });
  });

  it("el método del producto se bloquea cuando ya tiene movimientos", async () => {
    const p = await preparar("peps");
    const r = await pedir("PATCH", `/productos/${p}`, CONTADOR, { metodoValuacion: "promedio_ponderado" });
    expect(r.status).toBe(422);
    expect(r.cuerpo["message"]).toMatch(/ya tiene movimientos/);
    const sinMovimientos = await nuevoProducto();
    expect(
      (await pedir("PATCH", `/productos/${sinMovimientos}`, CONTADOR, { metodoValuacion: "peps" })).status,
    ).toBe(200);
  });
});

describe("kardex", () => {
  it("muestra entradas, salidas y saldo en unidades y valores, línea por línea", async () => {
    const p = await nuevoProducto();
    await mover(p, "entrada", 8, "2026-10-04", { costoUnitario: "590", referencia: "CCF-P001" });
    await mover(p, "salida", 2, "2026-10-08");
    await mover(p, "salida", 3, "2026-10-15");
    await mover(p, "entrada", 4, "2026-10-20", { costoUnitario: "600" });

    const { status, cuerpo: k } = await kardex(p);
    expect(status).toBe(200);
    expect(
      k.lineas.map((l) => [
        l.fecha,
        l.entrada?.costoTotal ?? null,
        l.salida?.costoTotal ?? null,
        l.saldo.cantidad,
        l.saldo.costoTotal,
      ]),
    ).toEqual([
      ["2026-10-04", "4720.00", null, "8.0000", "4720.00"],
      ["2026-10-08", null, "1180.00", "6.0000", "3540.00"],
      ["2026-10-15", null, "1770.00", "3.0000", "1770.00"],
      ["2026-10-20", "2400.00", null, "7.0000", "4170.00"],
    ]);
    expect(k.lineas[0]!.referencia).toBe("CCF-P001");
    expect(k.totales).toEqual({
      entradaCantidad: "12.0000",
      entradaTotal: "7120.00",
      salidaCantidad: "5.0000",
      salidaTotal: "2950.00",
    });
    expect(k.saldoFinal).toEqual({ cantidad: "7.0000", costoTotal: "4170.00", costoUnitario: "595.7143" });
  });

  it("con un rango, lo anterior es el saldo inicial y se ven solo los movimientos del rango", async () => {
    const p = await nuevoProducto();
    await mover(p, "entrada", 10, "2026-09-20");
    await mover(p, "salida", 4, "2026-10-05");
    await mover(p, "salida", 1, "2026-10-25");
    const k = (await kardex(p, "&desde=2026-10-01&hasta=2026-10-31")).cuerpo;
    expect(k.saldoInicial).toEqual({ cantidad: "10.0000", costoTotal: "100.00", costoUnitario: "10.0000" });
    expect(k.lineas).toHaveLength(2);
    const hastaMitad = (await kardex(p, "&desde=2026-10-01&hasta=2026-10-10")).cuerpo;
    expect(hastaMitad.lineas).toHaveLength(1);
    expect(hastaMitad.saldoFinal.cantidad).toBe("6.0000");
  });

  it("las existencias de cada sucursal son independientes", async () => {
    const p = await nuevoProducto();
    await mover(p, "entrada", 5, "2026-10-01");
    const enUsulutan = await pedir("POST", "/movimientos-inventario", CONTADOR, {
      productoId: p,
      sucursalId: usulutanId,
      tipo: "salida",
      cantidad: 1,
      fecha: "2026-10-02",
    });
    expect(enUsulutan.status).toBe(422);
    const k = await pedir("GET", `/productos/${p}/kardex?sucursalId=${usulutanId}`, CONTADOR);
    expect((k.cuerpo as unknown as KardexVista).lineas).toEqual([]);
  });

  it("la sucursal es obligatoria y debe ser de la empresa", async () => {
    const p = await nuevoProducto();
    expect((await pedir("GET", `/productos/${p}/kardex`, CONTADOR)).status).toBe(400);
    const deOtra = await pedir("GET", `/productos/${p}/kardex?sucursalId=${ajena.sucursalId}`, CONTADOR);
    expect(deOtra.status).toBe(404);
  });
});

describe("permisos y alcance por sucursal", () => {
  it("quien solo consulta ve el kardex pero no registra movimientos", async () => {
    const p = await nuevoProducto();
    await mover(p, "entrada", 5, "2026-10-01");
    expect((await kardex(p, "", CONSULTA)).status).toBe(200);
    expect((await mover(p, "entrada", 1, "2026-10-02", {}, CONSULTA)).status).toBe(403);
  });

  it("un usuario limitado a una sucursal no usa las demás", async () => {
    const p = await nuevoProducto();
    expect((await mover(p, "entrada", 5, "2026-10-01", {}, AUXILIAR_MATRIZ)).status).toBe(201);
    const ajeno = await pedir("POST", "/movimientos-inventario", AUXILIAR_MATRIZ, {
      productoId: p,
      sucursalId: usulutanId,
      tipo: "entrada",
      cantidad: 1,
      costoUnitario: "5",
      fecha: "2026-10-01",
    });
    expect(ajeno.status).toBe(403);
    const lectura = await pedir("GET", `/productos/${p}/kardex?sucursalId=${usulutanId}`, AUXILIAR_MATRIZ);
    expect(lectura.status).toBe(403);
    // el auxiliar de Usulután no ve el kardex de la matriz
    expect((await kardex(p, "", AUXILIAR_USULUTAN)).status).toBe(403);
  });

  it("sin sesión no se accede y un producto de otra empresa no existe", async () => {
    const p = await nuevoProducto();
    expect((await kardex(p, "", null as unknown as string)).status).toBe(401);
    const ajeno = await nuevoProducto({}, ajena.empresaId, CONTADOR).catch(() => null);
    expect(ajeno).toBeNull(); // el contador no es miembro de la otra empresa
  });

  it("cada movimiento queda en la bitácora a nombre de quien lo registró", async () => {
    const filas = await c.query(
      `select distinct usuario_id from bitacora where empresa_id = $1 and tabla = 'movimientos_inventario'`,
      [esc.empresaId],
    );
    const usuarios = filas.rows.map((f) => f.usuario_id);
    expect(usuarios).toContain(CONTADOR);
    expect(usuarios).toContain(AUXILIAR_MATRIZ);
  });
});
