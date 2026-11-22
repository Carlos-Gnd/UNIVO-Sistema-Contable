import { describe, expect, it } from "vitest";
import type { EstadoResultados } from "@contable/shared";
import { crearExcelEstadoResultados } from "./estado-resultados-excel";

const estado: EstadoResultados = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  ventas: {
    titulo: "Ventas",
    renglones: [{ codigo: "5101", nombre: "Ventas netas", monto: "1000.00" }],
    total: "1000.00",
  },
  costoVentas: { titulo: "Costo de ventas", renglones: [], total: "0.00" },
  utilidadBruta: "1000.00",
  gastosOperacion: { titulo: "Gastos de operación", renglones: [], total: "0.00" },
  utilidadOperacion: "1000.00",
  otrosIngresos: { titulo: "Otros ingresos", renglones: [], total: "0.00" },
  otrosGastos: { titulo: "Otros gastos", renglones: [], total: "0.00" },
  utilidadAntesImpuesto: "1000.00",
  impuestoRenta: { titulo: "Impuesto sobre la renta", renglones: [], total: "0.00" },
  utilidadNeta: "1000.00",
};

async function abrirLibro(archivo: Blob) {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  const contenido = await new Promise<ArrayBuffer>((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      if (lector.result instanceof ArrayBuffer) resolver(lector.result);
      else rechazar(new Error("No se pudo leer el XLSX generado."));
    };
    lector.onerror = () => rechazar(lector.error);
    lector.readAsArrayBuffer(archivo);
  });
  await libro.xlsx.load(contenido);
  return libro;
}

describe("Excel del estado de resultados (S2-T44)", () => {
  it("incluye el período, renglones, totales numéricos y espacios de firma", async () => {
    const archivo = await crearExcelEstadoResultados(estado, {
      empresa: "CheroPhonex, S.A. de C.V.",
      alcance: "Consolidado",
      propietario: "Carlos Hernández",
      contador: "María Rivas",
      incluirFirmas: true,
    });
    const libro = await abrirLibro(archivo);
    const hoja = libro.getWorksheet("Estado de resultados");

    expect(archivo.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(hoja?.getCell("A1").value).toBe("CheroPhonex, S.A. de C.V.");
    expect(hoja?.getCell("A3").value).toContain("01/11/2026 al 30/11/2026 · Consolidado");
    expect(hoja?.getCell("A4").value).toBe("Concepto");
    expect(hoja?.getCell("A6").value).toBe("5101 · Ventas netas");
    expect(hoja?.getCell("B6").value).toBe(1000);
    expect(hoja?.getCell("B6").numFmt).toContain("0.00");
    expect(hoja?.getCell("A15").value).toBe("Utilidad neta");
    expect(hoja?.getCell("A18").value).toBe("Carlos Hernández");
    expect(hoja?.getCell("B18").value).toBe("María Rivas");
    expect(hoja?.views[0]?.state).toBe("frozen");
  });

  it("omite los espacios de firma cuando se desactivan", async () => {
    const archivo = await crearExcelEstadoResultados(estado, {
      empresa: "CheroPhonex",
      alcance: "Consolidado",
      propietario: "Carlos Hernández",
      contador: "María Rivas",
      incluirFirmas: false,
    });
    const libro = await abrirLibro(archivo);
    const hoja = libro.getWorksheet("Estado de resultados");
    const valores = hoja
      ?.getSheetValues()
      .flat()
      .filter((valor) => typeof valor === "string");

    expect(valores).not.toContain("Carlos Hernández");
    expect(valores).not.toContain("María Rivas");
  });
});
