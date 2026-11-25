// Importación de productos desde Excel (HU-64): plantilla, validación por fila y carga atómica.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import ExcelJS from "exceljs";
import type { ReporteImportacionProductos, ResultadoImportacionProductos } from "@contable/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const CONSULTA = "33333333-3333-4333-8333-333333333333";
const FORASTERO = "44444444-4444-4444-8444-444444444444";
const TITULOS = [
  "Código",
  "Nombre",
  "Categoría",
  "Unidad de medida",
  "Precio de venta",
  "Existencia mínima",
  "Método de valuación",
  "Controla series",
];

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;

async function usuario(id: string, rol: number, empresa: Escenario) {
  await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
    id,
    `U${rol}`,
    `u${id.slice(0, 4)}@imp.test`,
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

async function excel(filas: (string | number)[][], titulos = TITULOS): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Productos");
  hoja.addRow(titulos);
  for (const f of filas) hoja.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function subir(ruta: string, usuarioId: string | null, archivo?: Buffer, empresaId = esc.empresaId) {
  const cuerpo = new FormData();
  if (archivo) cuerpo.append("archivo", new Blob([new Uint8Array(archivo)]), "productos.xlsx");
  const r = await fetch(`${url}/empresas/${empresaId}/productos/importacion/${ruta}`, {
    method: "POST",
    headers: usuarioId ? { authorization: `Bearer ${usuarioId}` } : {},
    body: cuerpo,
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

const conteo = async () =>
  (await c.query(`select count(*)::int n from productos where empresa_id = $1`, [esc.empresaId])).rows[0]
    .n as number;

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_importar_productos");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-740101-101-4");
  ajena = await crearEscenario(c, "0614-740102-101-5");
  await usuario(CONTADOR, 2, esc);
  await usuario(CONSULTA, 4, esc);
  await usuario(FORASTERO, 2, ajena);
  await c.query(
    `insert into categorias_producto (empresa_id, nombre) values ($1, 'Celulares'), ($1, 'Accesorios')`,
    [esc.empresaId],
  );
  await c.query(
    `insert into productos (empresa_id, codigo, nombre) values ($1, 'EXISTE-1', 'Ya existente')`,
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
  it("se descarga como Excel con los títulos y las categorías de la empresa", async () => {
    const r = await fetch(`${url}/empresas/${esc.empresaId}/productos/importacion/plantilla`, {
      headers: { authorization: `Bearer ${CONTADOR}` },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await r.arrayBuffer()) as never);
    expect(libro.getWorksheet("Productos")!.getRow(1).values).toEqual([undefined, ...TITULOS]);
    const texto = JSON.stringify(libro.getWorksheet("Instrucciones")!.getSheetValues());
    expect(texto).toContain("Celulares");
  });
});

describe("validación por fila", () => {
  it("acepta un archivo correcto sin guardar nada", async () => {
    const archivo = await excel([
      ["CEL-01", "Samsung Galaxy S24", "Celulares", "unidad", 799.9, 2, "Promedio ponderado", "Sí"],
      ["ACC-01", "Funda", "accesorios", "", "", "", "", ""],
    ]);
    const r = await subir("validar", CONTADOR, archivo);
    expect(r.status).toBe(200);
    const rep = r.cuerpo as unknown as ReporteImportacionProductos;
    expect(rep).toMatchObject({ valido: true, filasLeidas: 2, errores: [] });
    expect(rep.filas[0]).toMatchObject({
      codigo: "CEL-01",
      precioVenta: "799.90",
      existenciaMinima: "2.0000",
      controlaSeries: true,
      metodoValuacion: "promedio_ponderado",
    });
    expect(rep.filas[1]).toMatchObject({
      codigo: "ACC-01",
      precioVenta: "0.00",
      controlaSeries: false,
      metodoValuacion: null,
    });
    expect(await conteo()).toBe(1);
  });

  it("señala cada problema con su fila y columna", async () => {
    const archivo = await excel([
      ["BAD CODE", "Nombre", "", "", "", "", "", ""],
      ["OK-1", "Producto", "Inventada", "", "", "", "", ""],
      ["OK-2", "Producto", "", "", "", "", "Fifo", ""],
      ["OK-3", "Producto", "", "", "", "", "", "Quizá"],
      ["EXISTE-1", "Repetido en la base", "", "", "", "", "", ""],
      ["DUP-1", "Uno", "", "", "", "", "", ""],
      ["dup-1", "Dos", "", "", "", "", "", ""],
      ["OK-4", "", "", "", "", "", "", ""],
      ["OK-5", "Precio malo", "", "", "-5", "", "", ""],
    ]);
    const rep = (await subir("validar", CONTADOR, archivo)).cuerpo as unknown as ReporteImportacionProductos;
    expect(rep.valido).toBe(false);
    expect(rep.filas).toEqual([]);
    const por = (fila: number) => rep.errores.filter((e) => e.fila === fila).map((e) => e.columna);
    expect(por(2)).toContain("Código");
    expect(rep.errores.find((e) => e.fila === 3)).toMatchObject({
      columna: "Categoría",
      mensaje: expect.stringMatching(/no existe/),
    });
    expect(por(4)).toEqual(["Método de valuación"]);
    expect(por(5)).toEqual(["Controla series"]);
    expect(rep.errores.find((e) => e.fila === 6)).toMatchObject({
      columna: "Código",
      mensaje: expect.stringMatching(/Ya existe/),
    });
    expect(rep.errores.find((e) => e.fila === 8)).toMatchObject({
      columna: "Código",
      mensaje: expect.stringMatching(/se repite en la fila 7/),
    });
    expect(por(9)).toContain("Nombre");
    expect(por(10)).toContain("Precio de venta");
  });

  it("rechaza columnas faltantes, un archivo que no es Excel y la ausencia de archivo", async () => {
    const sinColumna = await excel([["A-1", "X"]], ["Código", "Nombre"]);
    const rep = (await subir("validar", CONTADOR, sinColumna))
      .cuerpo as unknown as ReporteImportacionProductos;
    expect(rep.valido).toBe(false);
    expect(rep.errores.some((e) => /Falta la columna/.test(e.mensaje))).toBe(true);
    expect((await subir("validar", CONTADOR, Buffer.from("esto no es un excel"))).status).toBe(400);
    expect((await subir("validar", CONTADOR)).status).toBe(400);
  });
});

describe("carga atómica", () => {
  it("crea todos los productos con su categoría y método", async () => {
    const archivo = await excel([
      ["CEL-01", "Samsung Galaxy S24", "Celulares", "unidad", 799.9, 2, "PEPS", "Sí"],
      ["ACC-01", "Funda", "Accesorios", "", "", "", "", ""],
    ]);
    const r = await subir("cargar", CONTADOR, archivo);
    expect(r.status).toBe(200);
    expect((r.cuerpo as unknown as ResultadoImportacionProductos).creados).toBe(2);
    const filas = await c.query(
      `select p.codigo, p.precio_venta::text, p.metodo_valuacion::text, p.controla_series, cp.nombre as categoria
       from productos p left join categorias_producto cp on cp.id = p.categoria_id
       where p.empresa_id = $1 and p.codigo in ('CEL-01', 'ACC-01') order by p.codigo`,
      [esc.empresaId],
    );
    expect(filas.rows).toEqual([
      {
        codigo: "ACC-01",
        precio_venta: "0.00",
        metodo_valuacion: null,
        controla_series: false,
        categoria: "Accesorios",
      },
      {
        codigo: "CEL-01",
        precio_venta: "799.90",
        metodo_valuacion: "peps",
        controla_series: true,
        categoria: "Celulares",
      },
    ]);
    const bitacora = await c.query(
      `select usuario_id::text from bitacora where tabla = 'productos' and accion = 'INSERT' and datos_nuevos->>'codigo' = 'CEL-01'`,
    );
    expect(bitacora.rows).toEqual([{ usuario_id: CONTADOR }]);
  });

  it("con un solo error no crea ninguno", async () => {
    const antes = await conteo();
    const archivo = await excel([
      ["NUEVO-1", "Bueno", "", "", "", "", "", ""],
      ["NUEVO-2", "Malo", "Inventada", "", "", "", "", ""],
    ]);
    const r = await subir("cargar", CONTADOR, archivo);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ creados: 0, reporte: { valido: false } });
    expect(await conteo()).toBe(antes);
  });

  it("repetir la misma carga no duplica: los códigos ya existen", async () => {
    const archivo = await excel([["REPE-1", "Producto", "", "", "", "", "", ""]]);
    expect((await subir("cargar", CONTADOR, archivo)).cuerpo).toMatchObject({ creados: 1 });
    expect((await subir("cargar", CONTADOR, archivo)).cuerpo).toMatchObject({
      creados: 0,
      reporte: { valido: false },
    });
  });
});

describe("permisos y aislamiento", () => {
  it("la consulta recibe 403, un forastero 404 y sin sesión 401", async () => {
    const archivo = await excel([["P-1", "Producto", "", "", "", "", "", ""]]);
    expect((await subir("cargar", CONSULTA, archivo)).status).toBe(403);
    expect((await subir("validar", FORASTERO, archivo)).status).toBe(404);
    expect((await subir("validar", null, archivo)).status).toBe(401);
  });
});
