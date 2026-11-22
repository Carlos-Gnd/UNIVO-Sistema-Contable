import { describe, expect, it } from "vitest";
import type { Balanza } from "@contable/shared";
import { crearBalanzaExcel } from "./balanza-excel";
import { crearDocumentoBalanza } from "./balanza-pdf";

const balanza: Balanza = {
  tipo: "antes-ajustes",
  titulo: "Balanza de comprobación antes de ajustes",
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  lineas: [
    {
      cuentaId: "cuenta-1",
      codigo: "110101",
      nombre: "Caja <general>",
      naturaleza: "deudora",
      tipo: "activo",
      saldoInicialDebe: "100.00",
      saldoInicialHaber: "0.00",
      movimientoDebe: "50.00",
      movimientoHaber: "20.00",
      saldoFinalDebe: "130.00",
      saldoFinalHaber: "0.00",
      saldoContrario: true,
    },
  ],
  totales: {
    saldoInicialDebe: "100.00",
    saldoInicialHaber: "0.00",
    movimientoDebe: "50.00",
    movimientoHaber: "20.00",
    saldoFinalDebe: "130.00",
    saldoFinalHaber: "0.00",
  },
  diferencias: { saldoInicial: "100.00", movimientos: "30.00", saldoFinal: "130.00" },
  cuadra: false,
};

const datos = { empresa: "CheroPhonex <S.A.>", alcance: "San Miguel Centro" };

describe("exportación de balanzas (S2-T31)", () => {
  it("crea un documento PDF imprimible con filtros, montos y alerta, escapando el HTML", () => {
    const documento = crearDocumentoBalanza(balanza, datos);

    expect(documento).toContain("CheroPhonex &lt;S.A.&gt;");
    expect(documento).toContain("Caja &lt;general&gt;");
    expect(documento).toContain("01/11/2026 al 30/11/2026 · San Miguel Centro");
    expect(documento).toContain("Saldo contrario a su naturaleza");
    expect(documento).toContain("La balanza no cuadra");
    expect(documento).toContain("130.00");
    expect(documento).not.toContain("Caja <general>");
  });

  it("genera un XLSX con las cuentas, totales y diferencias como celdas numéricas", async () => {
    const archivo = await crearBalanzaExcel(balanza, datos, new Date("2026-11-21T12:00:00.000Z"));
    const exceljs = await import("exceljs");
    const ExcelJS = (exceljs as unknown as { default?: typeof exceljs }).default ?? exceljs;
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
    const hoja = libro.getWorksheet("Balanza");

    expect(archivo.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(hoja?.getCell("A1").value).toBe(datos.empresa);
    expect(hoja?.getCell("A7").value).toContain("110101 Caja <general>");
    expect(hoja?.getCell("B7").value).toBe(100);
    expect(hoja?.getCell("G7").value).toBe(0);
    expect(hoja?.getCell("A8").value).toBe("Totales");
    expect(hoja?.getCell("B8").value).toBe(100);
    expect(hoja?.getCell("A10").value).toBe("Diferencia de los movimientos");
    expect(hoja?.getCell("D10").value).toBe(30);
    expect(hoja?.views[0]?.state).toBe("frozen");
  });
});
