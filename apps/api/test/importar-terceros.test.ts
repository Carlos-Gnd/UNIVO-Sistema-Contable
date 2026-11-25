// Importación de clientes y proveedores desde Excel (HU-58): plantilla, validación por fila y carga atómica.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import ExcelJS from "exceljs";
import type { ReporteImportacionTerceros, ResultadoImportacionTerceros } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";
const TITULOS = [
  "Nombre",
  "NIT",
  "NRC",
  "Actividad económica",
  "Clasificación",
  "Dirección",
  "Teléfono",
  "Correo",
  "Tipo",
  "Días de crédito",
];
type Fila = (string | number)[];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;

async function usuario(id: string, rol: number, empresa: Escenario) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `U${rol}`,
    `u${id.slice(0, 4)}@impt.test`,
  ]);
  const m = await c.query(
    `insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id`,
    [id, empresa.empresaId, rol, rol <= 2],
  );
  if (rol > 2) {
    await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
      m.rows[0].id,
      empresa.sucursalId,
    ]);
  }
}

async function excel(filas: Fila[], titulos = TITULOS): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Clientes y proveedores");
  hoja.addRow(titulos);
  for (const f of filas) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function subir(ruta: string, usuarioId: string | null, archivo?: Buffer, empresaId = esc.empresaId) {
  const cuerpo = new FormData();
  if (archivo) cuerpo.append("archivo", new Blob([new Uint8Array(archivo)]), "terceros.xlsx");
  const r = await fetch(`${url}/empresas/${empresaId}/terceros/importacion/${ruta}`, {
    method: "POST",
    headers: usuarioId ? { authorization: `Bearer ${usuarioId}` } : {},
    body: cuerpo,
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const conteo = async () =>
  (await c.query(`select count(*)::int n from terceros where empresa_id = $1`, [esc.empresaId])).rows[0]
    .n as number;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_importar_terceros");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-740101-101-4");
  ajena = await crearEscenario(c, "0614-740102-101-5");
  await usuario(CONTADOR, 2, esc);
  await usuario(CONSULTA, 4, esc);
  await usuario(FORASTERO, 2, ajena);
  await c.query(
    `insert into terceros (empresa_id, nombre, nit, nrc, es_cliente) values ($1, 'Ya existente', '0000-000000-104-0', '123456-7', true)`,
    [esc.empresaId],
  );
  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue({ verificarToken: async (t: string) => (/^[0-9a-f-]{36}$/.test(t) ? { id: t } : null) })
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("plantilla", () => {
  it("se descarga como Excel con los títulos y las instrucciones", async () => {
    const r = await fetch(`${url}/empresas/${esc.empresaId}/terceros/importacion/plantilla`, {
      headers: { authorization: `Bearer ${CONTADOR}` },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await r.arrayBuffer()) as never);
    expect(libro.getWorksheet("Clientes y proveedores")!.getRow(1).values).toEqual([undefined, ...TITULOS]);
    expect(libro.getWorksheet("Instrucciones")).toBeDefined();
  });
});

describe("validación por fila", () => {
  it("acepta un archivo correcto sin guardar nada y normaliza NIT y NRC", async () => {
    const archivo = await excel([
      [
        "Tecno Plaza, S.A. de C.V.",
        "12345678901230",
        "2458714",
        "Telefonía",
        "Mediano contribuyente",
        "",
        "",
        "",
        "Cliente",
        30,
      ],
      ["Distribuidora Norte", "12345678-4", "", "", "", "San Salvador", "2222-3333", "n@d.com", "Ambos", ""],
    ]);
    const r = await subir("validar", CONTADOR, archivo);
    expect(r.status).toBe(200);
    const rep = r.cuerpo as unknown as ReporteImportacionTerceros;
    expect(rep).toMatchObject({ valido: true, filasLeidas: 2, errores: [] });
    expect(rep.filas[0]).toMatchObject({
      nit: "1234-567890-123-0",
      nrc: "245871-4",
      clasificacion: "mediano",
      esCliente: true,
      esProveedor: false,
      diasCredito: 30,
    });
    expect(rep.filas[1]).toMatchObject({
      nit: "12345678-4",
      nrc: null,
      clasificacion: "otro",
      esCliente: true,
      esProveedor: true,
      diasCredito: 0,
    });
    expect(await conteo()).toBe(1);
  });

  it("señala cada problema con su fila y columna", async () => {
    const archivo = await excel([
      ["NIT malo", "1234-567890-123-1", "", "", "", "", "", "", "Cliente", ""],
      ["NRC malo", "0000-000000-011-5", "abc", "", "", "", "", "", "Cliente", ""],
      ["Sin tipo", "0614-010190-100-0", "", "", "", "", "", "", "Otro", ""],
      ["Clasificación mala", "0614-010190-100-0", "", "", "Enorme", "", "", "", "Cliente", ""],
      ["NIT en la base", "0000-000000-104-0", "", "", "", "", "", "", "Cliente", ""],
      ["NRC en la base", "0000-000000-011-5", "123456-7", "", "", "", "", "", "Cliente", ""],
      ["Primero", "1234-567890-123-0", "245871-4", "", "", "", "", "", "Cliente", ""],
      ["Repite NIT", "1234-567890-123-0", "", "", "", "", "", "", "Proveedor", ""],
      ["Repite NRC", "12345678-4", "245871-4", "", "", "", "", "", "Proveedor", ""],
      ["", "12345678-4", "", "", "", "", "", "", "Cliente", ""],
      ["Días malos", "0000-000000-011-5", "", "", "", "", "", "", "Cliente", 400],
    ]);
    const rep = (await subir("validar", CONTADOR, archivo)).cuerpo as unknown as ReporteImportacionTerceros;
    expect(rep.valido).toBe(false);
    expect(rep.filas).toEqual([]);
    const por = (fila: number) => rep.errores.filter((e) => e.fila === fila).map((e) => e.columna);
    expect(por(2)).toEqual(["NIT"]);
    expect(por(3)).toEqual(["NRC"]);
    expect(por(4)).toEqual(["Tipo"]);
    expect(por(5)).toEqual(["Clasificación"]);
    expect(rep.errores.find((e) => e.fila === 6)).toMatchObject({
      columna: "NIT",
      mensaje: expect.stringMatching(/en la empresa/),
    });
    expect(rep.errores.find((e) => e.fila === 7)).toMatchObject({
      columna: "NRC",
      mensaje: expect.stringMatching(/en la empresa/),
    });
    expect(por(8)).toEqual([]);
    expect(rep.errores.find((e) => e.fila === 9)).toMatchObject({
      columna: "NIT",
      mensaje: expect.stringMatching(/en la fila 8/),
    });
    expect(rep.errores.find((e) => e.fila === 10)).toMatchObject({
      columna: "NRC",
      mensaje: expect.stringMatching(/en la fila 8/),
    });
    expect(por(11)).toEqual(["Nombre"]);
    expect(por(12)).toEqual(["Días de crédito"]);
  });

  it("rechaza columnas faltantes, un archivo que no es Excel y la ausencia de archivo", async () => {
    const sinColumna = await excel([["X", "1234-567890-123-0"]], ["Nombre", "NIT"]);
    const rep = (await subir("validar", CONTADOR, sinColumna))
      .cuerpo as unknown as ReporteImportacionTerceros;
    expect(rep.valido).toBe(false);
    expect(rep.errores.some((e) => /Falta la columna/.test(e.mensaje))).toBe(true);
    expect((await subir("validar", CONTADOR, Buffer.from("esto no es un excel"))).status).toBe(400);
    expect((await subir("validar", CONTADOR)).status).toBe(400);
  });
});

describe("carga atómica", () => {
  it("crea todos los registros y la bitácora anota al autor", async () => {
    const archivo = await excel([
      [
        "Tecno Plaza, S.A. de C.V.",
        "1234-567890-123-0",
        "245871-4",
        "",
        "Gran contribuyente",
        "",
        "",
        "",
        "Cliente",
        15,
      ],
      ["Proveedora Sur", "12345678-4", "", "", "", "", "", "", "Proveedor", ""],
    ]);
    const r = await subir("cargar", CONTADOR, archivo);
    expect(r.status).toBe(200);
    expect((r.cuerpo as unknown as ResultadoImportacionTerceros).creados).toBe(2);
    const filas = await c.query(
      `select nombre, nit, clasificacion::text, es_cliente, es_proveedor, dias_credito from terceros
       where empresa_id = $1 and nombre <> 'Ya existente' order by nombre`,
      [esc.empresaId],
    );
    expect(filas.rows).toEqual([
      {
        nombre: "Proveedora Sur",
        nit: "12345678-4",
        clasificacion: "otro",
        es_cliente: false,
        es_proveedor: true,
        dias_credito: 0,
      },
      {
        nombre: "Tecno Plaza, S.A. de C.V.",
        nit: "1234-567890-123-0",
        clasificacion: "grande",
        es_cliente: true,
        es_proveedor: false,
        dias_credito: 15,
      },
    ]);
    const bitacora = await c.query(
      `select usuario_id::text from bitacora where tabla = 'terceros' and accion = 'INSERT' and datos_nuevos->>'nit' = '1234-567890-123-0'`,
    );
    expect(bitacora.rows).toEqual([{ usuario_id: CONTADOR }]);
  });

  it("con un solo error no crea ninguno", async () => {
    const antes = await conteo();
    const archivo = await excel([
      ["Bueno", "0000-000000-011-5", "", "", "", "", "", "", "Cliente", ""],
      ["Malo", "1234-567890-123-1", "", "", "", "", "", "", "Cliente", ""],
    ]);
    const r = await subir("cargar", CONTADOR, archivo);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ creados: 0, reporte: { valido: false } });
    expect(await conteo()).toBe(antes);
  });

  it("repetir la misma carga no duplica: el NIT ya existe", async () => {
    const archivo = await excel([["Repetido", "0614-010190-100-0", "", "", "", "", "", "", "Cliente", ""]]);
    expect((await subir("cargar", CONTADOR, archivo)).cuerpo).toMatchObject({ creados: 1 });
    expect((await subir("cargar", CONTADOR, archivo)).cuerpo).toMatchObject({
      creados: 0,
      reporte: { valido: false },
    });
  });
});

describe("permisos y aislamiento", () => {
  it("la consulta recibe 403, un forastero 404 y sin sesión 401", async () => {
    const archivo = await excel([["P", "0000-000000-011-5", "", "", "", "", "", "", "Cliente", ""]]);
    expect((await subir("cargar", CONSULTA, archivo)).status).toBe(403);
    expect((await subir("validar", FORASTERO, archivo)).status).toBe(404);
    expect((await subir("validar", null, archivo)).status).toBe(401);
  });
});
