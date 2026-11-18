import { describe, expect, it } from "vitest";
import type { LibroDiario } from "@contable/shared";
import { crearLibroDiarioExcel } from "./libro-diario-excel";

const libro: LibroDiario = {
  desde: "2026-01-01",
  hasta: "2026-01-31",
  sucursalId: null,
  tipo: null,
  renglonesPorPagina: 40,
  partidas: 1,
  cuadra: true,
  totales: { debe: "100.00", haber: "100.00" },
  paginas: [
    {
      folio: 3,
      vienen: { debe: "20.00", haber: "20.00" },
      pasan: { debe: "120.00", haber: "120.00" },
      renglones: [
        {
          tipo: "partida",
          partidaId: "p-1",
          fecha: "2026-01-05",
          codigo: "001-0001",
          descripcion: "Apertura",
          parcial: null,
          debe: null,
          haber: null,
        },
        {
          tipo: "subcuenta",
          partidaId: "p-1",
          fecha: null,
          codigo: "110101",
          descripcion: "Caja general",
          parcial: "100.00",
          debe: "100.00",
          haber: null,
        },
      ],
    },
  ],
};

describe("crearLibroDiarioExcel", () => {
  it("exporta el período, folios, columnas y totales en celdas de Excel", async () => {
    const exceljs = await import("exceljs");
    const ExcelJS = (exceljs as unknown as { default?: typeof exceljs }).default ?? exceljs;
    const archivo = await crearLibroDiarioExcel(libro, { empresa: "CheroPhonex" }, new Date("2026-02-01"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await archivo.arrayBuffer());

    const hoja = workbook.getWorksheet("Libro diario");
    expect(hoja).toBeDefined();
    expect(hoja?.getCell("A1").value).toBe("CheroPhonex");
    expect(hoja?.getCell("A3").value).toContain("01/01/2026 al 31/01/2026");
    expect(hoja?.getRow(6).values).toEqual([
      undefined,
      "Folio",
      "Fecha",
      "Partida",
      "Código",
      "Cuenta y concepto",
      "Parcial",
      "Debe",
      "Haber",
    ]);
    expect(hoja?.getCell("A7").value).toBe(3);
    expect(hoja?.getCell("E7").value).toBe("Vienen");
    expect(hoja?.getCell("G7").value).toBe(20);
    expect(hoja?.getCell("H7").value).toBe(20);
    expect(hoja?.getCell("E9").value).toBe("Caja general");
    expect(hoja?.getCell("G9").value).toBe(100);
    expect(hoja?.getCell("E10").value).toBe("Pasan");
  });

  it("descarga un archivo XLSX", async () => {
    const archivo = await crearLibroDiarioExcel(libro, { empresa: "CheroPhonex" });

    expect(archivo.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(archivo.size).toBeGreaterThan(0);
  });
});
