import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ArchivoInvalidoError, PLANTILLAS, type CuentaExistente } from "../domain/plantillas.js";
import { leerHoja, plantillaCatalogo, plantillaSaldos, textoDeCelda } from "./excel.js";

const abrir = async (archivo: Buffer) => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
  return libro;
};

/** Libro con una hoja y sus filas, para simular el archivo que sube el usuario. */
async function libro(nombreHoja: string, filas: ExcelJS.CellValue[][]): Promise<Buffer> {
  const l = new ExcelJS.Workbook();
  const hoja = l.addWorksheet(nombreHoja);
  for (const fila of filas) hoja.addRow(fila);
  return Buffer.from(await l.xlsx.writeBuffer());
}

const cuenta = (codigo: string, nombre: string, extra: Partial<CuentaExistente> = {}): CuentaExistente => ({
  id: codigo,
  codigo,
  nombre,
  naturaleza: "deudora",
  activa: true,
  imputable: true,
  tieneMovimientos: false,
  ...extra,
});

describe("plantillas (S1-T68)", () => {
  it("catálogo: hoja con los títulos, listas de naturaleza y tipo, e instrucciones", async () => {
    const l = await abrir(await plantillaCatalogo(PLANTILLAS.catalogo));
    expect(l.worksheets.map((h) => h.name)).toEqual(["Catálogo", "Instrucciones"]);
    const hoja = l.getWorksheet("Catálogo")!;
    expect(hoja.getRow(1).values).toEqual([undefined, "Código", "Nombre", "Naturaleza", "Tipo"]);
    expect(hoja.getCell("C2").dataValidation).toMatchObject({
      type: "list",
      formulae: ['"Deudora,Acreedora"'],
    });
    expect(hoja.getCell("D2").dataValidation.formulae).toEqual([
      '"Activo,Pasivo,Patrimonio,Costos y gastos,Ingresos,Liquidadora,Orden"',
    ]);
    // La plantilla vacía se lee sin filas: no hay ejemplos que se importen por error
    expect((await leerHoja(await plantillaCatalogo(PLANTILLAS.catalogo), PLANTILLAS.catalogo)).filas).toEqual(
      [],
    );
  });

  it("saldos: trae solo las cuentas de último nivel activas, ordenadas por código", async () => {
    const archivo = await plantillaSaldos(PLANTILLAS["saldos-iniciales"], [
      cuenta("5101", "Ventas"),
      cuenta("1101", "Efectivo", { imputable: false }),
      cuenta("110101", "Caja general"),
      cuenta("110102", "Caja chica", { activa: false }),
    ]);
    const hoja = (await abrir(archivo)).getWorksheet("Saldos iniciales")!;
    expect(hoja.getRow(1).values).toEqual([undefined, "Código", "Cuenta", "Debe", "Haber"]);
    expect([2, 3].map((n) => hoja.getRow(n).values)).toEqual([
      [undefined, "110101", "Caja general"],
      [undefined, "5101", "Ventas"],
    ]);
    expect(hoja.rowCount).toBe(3);
    expect(hoja.getCell("C2").dataValidation).toMatchObject({
      type: "decimal",
      operator: "greaterThanOrEqual",
    });
  });
});

describe("textoDeCelda", () => {
  it("convierte cada tipo de valor de ExcelJS a texto", () => {
    expect(textoDeCelda(null)).toBe("");
    expect(textoDeCelda("  Caja  ")).toBe("Caja");
    expect(textoDeCelda(1101)).toBe("1101");
    expect(textoDeCelda(0.1 + 0.2)).toBe("0.3");
    expect(textoDeCelda(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
    expect(textoDeCelda({ richText: [{ text: "Caja " }, { text: "general" }] })).toBe("Caja general");
    expect(textoDeCelda({ formula: "A1+A2", result: 150.5 })).toBe("150.5");
    expect(textoDeCelda({ text: "Enlace", hyperlink: "https://ejemplo.sv" })).toBe("Enlace");
    expect(textoDeCelda({ error: "#N/A" })).toBe("");
  });
});

describe("leerHoja (S1-T69)", () => {
  it("lee las filas con datos de la plantilla llenada y conserva el número de fila de Excel", async () => {
    const plantilla = PLANTILLAS["saldos-iniciales"];
    const l = await abrir(
      await plantillaSaldos(plantilla, [cuenta("110101", "Caja"), cuenta("5101", "Ventas")]),
    );
    const hoja = l.getWorksheet(plantilla.hoja)!;
    hoja.getCell("C2").value = 1250.1;
    hoja.getCell("D3").value = { formula: "C2", result: 1250.1 };
    hoja.addRow([]);
    hoja.addRow(["2101", "", "", 40]);

    const leida = await leerHoja(Buffer.from(await l.xlsx.writeBuffer()), plantilla);
    expect(leida).toEqual({
      columnasFaltantes: [],
      excedeMaximo: false,
      filas: [
        { fila: 2, valores: { codigo: "110101", cuenta: "Caja", debe: "1250.1", haber: "" } },
        { fila: 3, valores: { codigo: "5101", cuenta: "Ventas", debe: "", haber: "1250.1" } },
        { fila: 5, valores: { codigo: "2101", cuenta: "", debe: "", haber: "40" } },
      ],
    });
  });

  it("encuentra las columnas por su título aunque cambien de orden, de hoja o de mayúsculas", async () => {
    const archivo = await libro("Hoja1", [
      ["TIPO", "nombre", "codigo", "Naturaleza", "Notas"],
      ["Activo", "Caja", 110103, "Deudora", "no se lee"],
    ]);
    const leida = await leerHoja(archivo, PLANTILLAS.catalogo);
    expect(leida.filas).toEqual([
      { fila: 2, valores: { codigo: "110103", nombre: "Caja", naturaleza: "Deudora", tipo: "Activo" } },
    ]);
  });

  it("informa las columnas que faltan", async () => {
    const archivo = await libro("Catálogo", [["Código", "Nombre"]]);
    expect(await leerHoja(archivo, PLANTILLAS.catalogo)).toEqual({
      columnasFaltantes: ["Naturaleza", "Tipo"],
      filas: [],
      excedeMaximo: false,
    });
  });

  it("deja de leer después del máximo de filas", async () => {
    const filas = Array.from({ length: 5001 }, (_, i) => [String(i), "", "1"]);
    const leida = await leerHoja(
      await libro("Saldos iniciales", [["Código", "Cuenta", "Debe", "Haber"], ...filas]),
      PLANTILLAS["saldos-iniciales"],
    );
    expect(leida.excedeMaximo).toBe(true);
    expect(leida.filas).toHaveLength(5000);
  });

  it("rechaza lo que no es un .xlsx", async () => {
    await expect(leerHoja(Buffer.from("Código,Nombre\n1,Activo"), PLANTILLAS.catalogo)).rejects.toThrow(
      ArchivoInvalidoError,
    );
  });
});
