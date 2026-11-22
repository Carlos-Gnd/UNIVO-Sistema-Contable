import { describe, expect, it } from "vitest";
import type { HojaTrabajo } from "@contable/shared";
import { crearHojaTrabajoExcel } from "./hoja-trabajo-excel";

const reporte: HojaTrabajo = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  lineas: [
    {
      cuentaId: "cuenta-1",
      codigo: "110101",
      nombre: "Caja general",
      tipoCuenta: "activo",
      resultado: null,
      balanzaDebe: "100.00",
      balanzaHaber: "0.00",
      ajustesDebe: "0.00",
      ajustesHaber: "10.00",
      balanzaAjustadaDebe: "90.00",
      balanzaAjustadaHaber: "0.00",
      estadoResultadosDebe: "0.00",
      estadoResultadosHaber: "0.00",
      balanceGeneralDebe: "90.00",
      balanceGeneralHaber: "0.00",
    },
    {
      cuentaId: null,
      codigo: "",
      nombre: "Utilidad del ejercicio",
      tipoCuenta: null,
      resultado: "utilidad",
      balanzaDebe: "0.00",
      balanzaHaber: "0.00",
      ajustesDebe: "0.00",
      ajustesHaber: "0.00",
      balanzaAjustadaDebe: "0.00",
      balanzaAjustadaHaber: "0.00",
      estadoResultadosDebe: "0.00",
      estadoResultadosHaber: "90.00",
      balanceGeneralDebe: "0.00",
      balanceGeneralHaber: "90.00",
    },
  ],
  totales: {
    balanzaDebe: "100.00",
    balanzaHaber: "0.00",
    ajustesDebe: "0.00",
    ajustesHaber: "10.00",
    balanzaAjustadaDebe: "90.00",
    balanzaAjustadaHaber: "0.00",
    estadoResultadosDebe: "0.00",
    estadoResultadosHaber: "90.00",
    balanceGeneralDebe: "90.00",
    balanceGeneralHaber: "90.00",
  },
  resultado: { tipo: "utilidad", monto: "90.00" },
  diferencias: {
    balanza: "100.00",
    ajustes: "10.00",
    balanzaAjustada: "90.00",
    estadoResultados: "90.00",
    balanceGeneral: "0.00",
  },
  cuadra: false,
};

describe("exportación de hoja de trabajo a Excel (S2-T35)", () => {
  it("genera el libro de diez columnas con encabezados agrupados y montos numéricos", async () => {
    const archivo = await crearHojaTrabajoExcel(
      reporte,
      { empresa: "CheroPhonex, S.A. de C.V.", alcance: "Consolidado", nota: "Cifras ilustrativas" },
      new Date("2026-11-21T12:00:00.000Z"),
    );
    const modulo = await import("exceljs");
    const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
    const libro = new ExcelJS.Workbook();
    const buffer = await archivo.arrayBuffer();
    await libro.xlsx.load(buffer);
    const hoja = libro.getWorksheet("Hoja de trabajo");

    expect(archivo.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(hoja?.getCell("A1").value).toBe("CheroPhonex, S.A. de C.V.");
    expect(hoja?.getCell("A6").value).toBe("Cuenta");
    expect(hoja?.getCell("B6").value).toBe("Balanza de comprobación");
    expect(hoja?.getCell("D6").value).toBe("Ajustes");
    expect(hoja?.getCell("A7").value).toBe("Código y cuenta");
    expect(hoja?.getCell("A8").value).toBe("110101 Caja general");
    expect(hoja?.getCell("B8").value).toBe(100);
    expect(hoja?.getCell("B8").numFmt).toContain("0.00");
    expect(hoja?.getCell("A9").value).toBe("Utilidad del ejercicio");
    expect(hoja?.getCell("A10").value).toBe("Sumas iguales");
    expect(hoja?.getCell("A11").value).toBe("Sumas");
    expect(hoja?.views[0]?.state).toBe("frozen");
  });
});
