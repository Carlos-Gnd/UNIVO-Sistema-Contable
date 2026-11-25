// Series e IMEI (HU-66, S3-T82 a S3-T84): unicidad, existencias, costo específico y aislamiento.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { KardexVista } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONTADOR_AJENA = "22222222-2222-4222-8222-222222222222";
const CONTADOR_LIMITADO = "33333333-3333-4333-8333-333333333333";
const SIN_MEMBRESIA = "44444444-4444-4444-8444-444444444444";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;
let sucursalSecundaria: string;
let correlativo = 0;

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

async function crearUsuario(id: string, empresa: string, rol: number, sucursal: string | null) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `Usuario ${id.slice(0, 4)}`,
    `u${id.slice(0, 4)}@series.test`,
  ]);
  await c.query(
    "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4)",
    [id, empresa, rol, sucursal === null],
  );
  if (sucursal) {
    await c.query(
      "insert into membresia_sucursales (membresia_id, sucursal_id) select id, $2 from membresias where usuario_id = $1 and empresa_id = $3",
      [id, sucursal, empresa],
    );
  }
}

async function nuevoProducto(controlaSeries = true, empresa = esc.empresaId, usuario = CONTADOR) {
  const r = await pedir(
    "POST",
    "/productos",
    usuario,
    { codigo: `SER-${++correlativo}`, nombre: `Teléfono ${correlativo}`, controlaSeries },
    empresa,
  );
  expect(r.status).toBe(201);
  expect(r.cuerpo["controlaSeries"]).toBe(controlaSeries);
  return r.cuerpo["id"] as string;
}

function mover(
  productoId: string,
  tipo: "entrada" | "salida",
  fecha: string,
  series: string[] | undefined,
  costoUnitario?: string,
  cantidad = series?.length ?? 1,
  usuario = CONTADOR,
  sucursalId = esc.sucursalId,
  empresa = esc.empresaId,
) {
  return pedir(
    "POST",
    "/movimientos-inventario",
    usuario,
    {
      productoId,
      sucursalId,
      tipo,
      cantidad,
      fecha,
      ...(tipo === "entrada" && costoUnitario ? { costoUnitario } : {}),
      ...(series ? { series } : {}),
    },
    empresa,
  );
}

function consultarSeries(
  productoId: string,
  sucursalId = esc.sucursalId,
  usuario = CONTADOR,
  empresa = esc.empresaId,
) {
  return pedir(
    "GET",
    `/productos/${productoId}/series?sucursalId=${sucursalId}&estado=todas`,
    usuario,
    undefined,
    empresa,
  );
}

async function kardex(productoId: string) {
  return pedir("GET", `/productos/${productoId}/kardex?sucursalId=${esc.sucursalId}`, CONTADOR);
}

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_series_inventario");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-660101-101-1");
  ajena = await crearEscenario(c, "0614-660102-101-2");
  sucursalSecundaria = (
    await c.query(
      "insert into sucursales (empresa_id, nombre, codigo_establecimiento) values ($1, 'Usulután', 'S002') returning id",
      [esc.empresaId],
    )
  ).rows[0].id as string;
  await crearUsuario(CONTADOR, esc.empresaId, 2, null);
  await crearUsuario(CONTADOR_AJENA, ajena.empresaId, 2, null);
  await crearUsuario(CONTADOR_LIMITADO, esc.empresaId, 3, esc.sucursalId);

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

describe("series e IMEI", () => {
  it("captura una serie por unidad y valúa la salida al costo asignado a esa serie en el kardex", async () => {
    const producto = await nuevoProducto();
    expect((await mover(producto, "entrada", "2026-10-01", ["imei-a"], "10.00")).status).toBe(201);
    expect((await mover(producto, "entrada", "2026-10-02", ["imei-b"], "12.00")).status).toBe(201);

    const salida = await mover(producto, "salida", "2026-10-03", ["IMEI-B"]);
    expect(salida.status).toBe(201);
    expect(salida.cuerpo).toMatchObject({
      costoUnitario: "12.0000",
      costoTotal: "12.00",
      saldo: { cantidad: "1.0000", costoTotal: "10.00", costoUnitario: "10.0000" },
    });

    const lista = await consultarSeries(producto);
    expect(lista.status).toBe(200);
    expect(lista.cuerpo).toEqual([
      expect.objectContaining({
        numeroSerie: "IMEI-A",
        costoUnitario: "10.00",
        estado: "en_existencia",
        fechaEntrada: "2026-10-01",
        fechaSalida: null,
      }),
      expect.objectContaining({
        numeroSerie: "IMEI-B",
        costoUnitario: "12.00",
        estado: "vendida",
        fechaEntrada: "2026-10-02",
        fechaSalida: "2026-10-03",
      }),
    ]);

    const { cuerpo: kardexCuerpo } = await kardex(producto);
    const k = kardexCuerpo as unknown as KardexVista;
    expect(k.metodo).toBe("especifico");
    expect(k.totales).toEqual({
      entradaCantidad: "2.0000",
      entradaTotal: "22.00",
      salidaCantidad: "1.0000",
      salidaTotal: "12.00",
    });
    expect(k.saldoFinal).toEqual({ cantidad: "1.0000", costoTotal: "10.00", costoUnitario: "10.0000" });

    expect((await mover(producto, "salida", "2026-10-04", ["IMEI-B"])).status).toBe(422);
    expect(
      (await mover(producto, "salida", "2026-10-04", ["IMEI-A"], undefined, 1, CONTADOR, sucursalSecundaria))
        .status,
    ).toBe(422);

    const bitacora = await c.query(
      "select accion, usuario_id from bitacora where empresa_id = $1 and tabla = 'series_inventario'",
      [esc.empresaId],
    );
    expect(bitacora.rows).toContainEqual({ accion: "INSERT", usuario_id: CONTADOR });
    expect(bitacora.rows).toContainEqual({ accion: "UPDATE", usuario_id: CONTADOR });
  });

  it("impide series repetidas por empresa, pero mantiene el aislamiento entre empresas", async () => {
    const primero = await nuevoProducto();
    const segundo = await nuevoProducto();
    expect((await mover(primero, "entrada", "2026-10-01", ["DUP-001"], "3.00")).status).toBe(201);
    const duplicada = await mover(segundo, "entrada", "2026-10-01", ["dup-001"], "4.00");
    expect(duplicada.status).toBe(409);

    const productoAjeno = await nuevoProducto(true, ajena.empresaId, CONTADOR_AJENA);
    const mismaSerieEnOtraEmpresa = await mover(
      productoAjeno,
      "entrada",
      "2026-10-01",
      ["DUP-001"],
      "5.00",
      1,
      CONTADOR_AJENA,
      ajena.sucursalId,
      ajena.empresaId,
    );
    expect(mismaSerieEnOtraEmpresa.status).toBe(201);
    expect(
      (await consultarSeries(productoAjeno, ajena.sucursalId, CONTADOR_AJENA, ajena.empresaId)).status,
    ).toBe(200);
    expect((await consultarSeries(productoAjeno, ajena.sucursalId)).status).toBe(404);
  });

  it("rechaza cantidad fraccionaria, falta de series y números repetidos en el mismo movimiento", async () => {
    const producto = await nuevoProducto();
    expect((await mover(producto, "entrada", "2026-10-01", ["SER-1"], "1.00", 1.5)).status).toBe(422);
    expect((await mover(producto, "entrada", "2026-10-01", undefined, "1.00", 1)).status).toBe(422);

    const repetidas = await mover(producto, "entrada", "2026-10-01", ["ser-2", "SER-2"], "1.00");
    expect(repetidas.status).toBe(400);
    const cantidadIncompleta = await mover(producto, "entrada", "2026-10-01", ["SER-3"], "1.00", 2);
    expect(cantidadIncompleta.status).toBe(422);
  });

  it("respeta el permiso de sucursal y devuelve 404 a quien no pertenece a la empresa", async () => {
    const producto = await nuevoProducto();
    expect(
      (await mover(producto, "entrada", "2026-10-01", ["LIM-001"], "1.00", 1, CONTADOR_LIMITADO)).status,
    ).toBe(201);
    expect((await consultarSeries(producto, sucursalSecundaria, CONTADOR_LIMITADO)).status).toBe(403);
    expect((await consultarSeries(producto, esc.sucursalId, SIN_MEMBRESIA)).status).toBe(404);
  });
});
