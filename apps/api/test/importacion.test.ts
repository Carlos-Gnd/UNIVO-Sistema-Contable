// Importación desde Excel (HU-17): plantillas (S1-T68) y validación del archivo (S1-T69) de punta a punta.
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ReporteCatalogo, ReporteSaldosIniciales } from "@contable/shared";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePropia, crearEscenario, reiniciarBase, type Escenario } from "../../../packages/db/test/helpers";
import { AppModule } from "../src/app.module.js";
import { SupabaseAuthService } from "../src/auth/supabase-auth.service.js";

/** Supabase simulado: "Bearer <id del usuario>" es un token válido de ese usuario. */
const authPrueba: Pick<SupabaseAuthService, "verificarToken"> = {
  verificarToken: async (token) => (/^[0-9a-f-]{36}$/.test(token) ? { id: token } : null),
};

const CONTADOR = "11111111-1111-4111-8111-111111111111";
const AUXILIAR = "22222222-2222-4222-8222-222222222222";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let c: Awaited<ReturnType<typeof reiniciarBase>>;
let app: INestApplication;
let url: string;
let esc: Escenario;
let ajena: Escenario;

const ruta = (tipo: string, accion: string, empresaId = esc.empresaId) =>
  `${url}/empresas/${empresaId}/importacion/${tipo}/${accion}`;

async function descargar(tipo: string, usuario: string | null = CONTADOR, empresaId?: string) {
  const r = await fetch(ruta(tipo, "plantilla", empresaId), {
    headers: usuario ? { authorization: `Bearer ${usuario}` } : {},
  });
  return { r, archivo: Buffer.from(await r.arrayBuffer()) };
}

async function subir<T>(tipo: string, archivo: Buffer | null, usuario = CONTADOR) {
  const formulario = new FormData();
  if (archivo)
    formulario.append("archivo", new Blob([new Uint8Array(archivo)], { type: XLSX }), "datos.xlsx");
  const r = await fetch(ruta(tipo, "validar"), {
    method: "POST",
    headers: { authorization: `Bearer ${usuario}` },
    body: formulario,
  });
  return { status: r.status, cuerpo: (await r.json()) as T & Record<string, unknown> };
}

const abrir = async (archivo: Buffer) => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
  return libro;
};
/** Escribe las filas desde la fila 2, como lo hace el usuario en la plantilla. */
const llenar = (hoja: ExcelJS.Worksheet, filas: ExcelJS.CellValue[][]) =>
  filas.forEach((valores, i) => {
    hoja.getRow(i + 2).values = valores;
  });
const guardar = async (libro: ExcelJS.Workbook) => Buffer.from(await libro.xlsx.writeBuffer());

const cuantasCuentas = async () =>
  Number(
    (await c.query("select count(*) from cuentas where empresa_id = $1", [esc.empresaId])).rows[0].count,
  );

beforeAll(async () => {
  const urlBase = await basePropia("contable_api_importacion");
  c = await reiniciarBase(urlBase);
  esc = await crearEscenario(c, "0614-010190-101-5");
  ajena = await crearEscenario(c, "0614-010190-102-0");
  // Una cuenta acreedora más para que los saldos puedan cuadrar
  await c.query(
    `insert into cuentas (empresa_id, codigo, nombre, naturaleza, tipo) values
       ($1, '3', 'Patrimonio', 'acreedora', 'patrimonio'), ($1, '31', 'Capital', 'acreedora', 'patrimonio'),
       ($1, '3101', 'Capital social', 'acreedora', 'patrimonio')`,
    [esc.empresaId],
  );

  for (const [id, rol, todas] of [
    [CONTADOR, 2, true],
    [AUXILIAR, 3, false],
  ] as const) {
    await c.query("insert into usuarios (id, nombre, correo) values ($1, $2, $3)", [
      id,
      `Usuario ${rol}`,
      `${id}@prueba.sv`,
    ]);
    const m = await c.query(
      "insert into membresias (usuario_id, empresa_id, rol_id, todas_sucursales) values ($1, $2, $3, $4) returning id",
      [id, esc.empresaId, rol, todas],
    );
    if (!todas) {
      await c.query("insert into membresia_sucursales (membresia_id, sucursal_id) values ($1, $2)", [
        m.rows[0].id,
        esc.sucursalId,
      ]);
    }
  }

  process.env["DATABASE_URL"] = urlBase;
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseAuthService)
    .useValue(authPrueba)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  url = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  await c?.end();
});

describe("GET /empresas/:empresa/importacion/:tipo/plantilla (S1-T68)", () => {
  it("descarga la plantilla del catálogo como .xlsx", async () => {
    const { r, archivo } = await descargar("catalogo");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe(XLSX);
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="plantilla-catalogo.xlsx"');
    const libro = await abrir(archivo);
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Catálogo", "Instrucciones"]);
  });

  it("la de saldos trae las cuentas de último nivel de la empresa", async () => {
    const { r, archivo } = await descargar("saldos-iniciales");
    expect(r.headers.get("content-disposition")).toBe(
      'attachment; filename="plantilla-saldos-iniciales.xlsx"',
    );
    const hoja = (await abrir(archivo)).getWorksheet("Saldos iniciales")!;
    const filas: unknown[] = [];
    hoja.eachRow((fila, n) => {
      if (n > 1) filas.push((fila.values as unknown[]).slice(1));
    });
    expect(filas).toEqual([
      ["110101", "Caja general"],
      ["3101", "Capital social"],
      ["5101", "Ventas"],
    ]);
  });

  it("exige sesión, el permiso catalogo.importar y pertenecer a la empresa", async () => {
    expect((await descargar("catalogo", null)).r.status).toBe(401);
    expect((await descargar("catalogo", AUXILIAR)).r.status).toBe(403);
    expect((await descargar("catalogo", CONTADOR, ajena.empresaId)).r.status).toBe(404);
    const otro = await descargar("productos");
    expect(otro.r.status).toBe(400);
  });
});

describe("POST /empresas/:empresa/importacion/:tipo/validar (S1-T69)", () => {
  it("valida un catálogo correcto y no guarda nada", async () => {
    const libro = await abrir((await descargar("catalogo")).archivo);
    const hoja = libro.getWorksheet("Catálogo")!;
    llenar(hoja, [
      ["110102", "Caja chica", "Deudora", "Activo"],
      ["2", "Pasivo", "Acreedora", "Pasivo"],
      ["21", "Pasivo corriente", "Acreedora", "Pasivo"],
    ]);
    const antes = await cuantasCuentas();

    const r = await subir<ReporteCatalogo>("catalogo", await guardar(libro));

    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ tipo: "catalogo", valido: true, filasLeidas: 3, errores: [] });
    expect(r.cuerpo.filas.map((f) => [f.fila, f.codigo, f.naturaleza, f.tipo])).toEqual([
      [2, "110102", "deudora", "activo"],
      [3, "2", "acreedora", "pasivo"],
      [4, "21", "acreedora", "pasivo"],
    ]);
    expect(await cuantasCuentas()).toBe(antes);
  });

  it("devuelve los errores por fila de un catálogo con problemas", async () => {
    const libro = await abrir((await descargar("catalogo")).archivo);
    const hoja = libro.getWorksheet("Catálogo")!;
    llenar(hoja, [
      ["110101", "Caja repetida", "Deudora", "Activo"],
      ["910101", "Sin padre", "Deudora", "Activo"],
    ]);

    const r = await subir<ReporteCatalogo>("catalogo", await guardar(libro));

    expect(r.status).toBe(200);
    expect(r.cuerpo.valido).toBe(false);
    expect(r.cuerpo.filas).toEqual([]);
    expect(r.cuerpo.errores).toEqual([
      { fila: 2, columna: "Código", mensaje: "La cuenta 110101 ya existe en el catálogo de la empresa." },
      {
        fila: 3,
        columna: "Código",
        mensaje: "No existe la cuenta padre 9101 ni en el archivo ni en el catálogo.",
      },
    ]);
  });

  it("valida los saldos llenados en la plantilla descargada", async () => {
    const libro = await abrir((await descargar("saldos-iniciales")).archivo);
    const hoja = libro.getWorksheet("Saldos iniciales")!;
    hoja.getCell("C2").value = 1500.25; // 110101 Caja general, debe
    hoja.getCell("D3").value = 1500.25; // 3101 Capital social, haber

    const r = await subir<ReporteSaldosIniciales>("saldos-iniciales", await guardar(libro));

    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({
      tipo: "saldos-iniciales",
      valido: true,
      filasLeidas: 3,
      errores: [],
      advertencias: [],
      resumen: { totalDebe: "1500.25", totalHaber: "1500.25", diferencia: "0.00", cuadra: true },
    });
    expect(r.cuerpo.filas).toEqual([
      { fila: 2, cuentaId: esc.cuentas["110101"], codigo: "110101", debe: "1500.25", haber: "0.00" },
      { fila: 3, cuentaId: expect.any(String), codigo: "3101", debe: "0.00", haber: "1500.25" },
    ]);
  });

  it("los saldos usan el catálogo de la empresa, no el de otra", async () => {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Saldos iniciales");
    hoja.addRow(["Código", "Cuenta", "Debe", "Haber"]);
    hoja.addRow(["1101", "Efectivo", 10, null]);
    hoja.addRow(["3101", "Capital", null, 10]);
    // 3101 existe en esta empresa pero no en la otra
    expect(
      (await c.query("select 1 from cuentas where empresa_id = $1 and codigo = '3101'", [ajena.empresaId]))
        .rowCount,
    ).toBe(0);

    const r = await subir<ReporteSaldosIniciales>("saldos-iniciales", await guardar(libro));
    expect(r.cuerpo.errores).toEqual([
      {
        fila: 2,
        columna: "Código",
        mensaje: "La cuenta 1101 no es de último nivel; registre el saldo en sus subcuentas.",
      },
    ]);
  });

  it("rechaza la solicitud sin archivo, con un archivo que no es Excel o demasiado grande", async () => {
    const sinArchivo = await subir("catalogo", null);
    expect(sinArchivo.status).toBe(400);
    expect(sinArchivo.cuerpo["message"]).toBe("Adjunte el archivo de Excel en el campo «archivo».");

    const csv = await subir("catalogo", Buffer.from("Código,Nombre\n1,Activo"));
    expect(csv.status).toBe(400);
    expect(csv.cuerpo["message"]).toBe("El archivo no es un libro de Excel (.xlsx) válido.");

    expect((await subir("catalogo", Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
  });

  it("el auxiliar no puede validar importaciones", async () => {
    const archivo = (await descargar("catalogo")).archivo;
    expect((await subir("catalogo", archivo, AUXILIAR)).status).toBe(403);
  });
});
