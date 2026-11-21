import { describe, expect, it } from "vitest";
import type { HojaTrabajo } from "@contable/shared";
import { crearHojaTrabajoExcel } from "./hoja-trabajo-excel";
import { crearDocumentoHojaTrabajo } from "./hoja-trabajo-pdf";

const hojaTrabajo: HojaTrabajo = {
  desde: "2026-11-01",
  hasta: "2026-11-30",
  sucursalId: null,
  lineas: [
    {
      cuentaId: "cuenta-1",
      codigo: "110101",
      nombre: "Caja <general>",
      tipoCuenta: "activo",
      resultado: null,
      balanzaDebe: "100.00",
      balanzaHaber: "100.00",
      ajustesDebe: "10.00",
      ajustesHaber: "10.00",
      balanzaAjustadaDebe: "110.00",
      balanzaAjustadaHaber: "110.00",
      estadoResultadosDebe: "850.00",
      estadoResultadosHaber: "1000.00",
      balanceGeneralDebe: "1000.00",
      balanceGeneralHaber: "850.00",
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
      estadoResultadosDebe: "150.00",
      estadoResultadosHaber: "0.00",
      balanceGeneralDebe: "0.00",
      balanceGeneralHaber: "150.00",
    },
  ],
  totales: {
    balanzaDebe: "100.00",
    balanzaHaber: "100.00",
    ajustesDebe: "10.00",
    ajustesHaber: "10.00",
    balanzaAjustadaDebe: "110.00",
    balanzaAjustadaHaber: "110.00",
    estadoResultadosDebe: "1000.00",
    estadoResultadosHaber: "1000.00",
    balanceGeneralDebe: "1000.00",
    balanceGeneralHaber: "1000.00",
  },
  resultado: { tipo: "utilidad", monto: "150.00" },
  diferencias: {
    balanza: "0.00",
    ajustes: "0.00",
    balanzaAjustada: "0.00",
    estadoResultados: "0.00",
    balanceGeneral: "0.00",
  },
  cuadra: true,
};

const datos = { empresa: "CheroPhonex <S.A.> de C.V.", alcance: "Consolidado", nota: "Cifras ilustrativas" };

describe("exportación de hoja de trabajo (S2-T31)", () => {
  it("crea un PDF con diez columnas, sumas y aviso de utilidad, escapando el HTML", () => {
    const documento = crearDocumentoHojaTrabajo(hojaTrabajo, datos);

    expect(documento).toContain("CheroPhonex &lt;S.A.&gt; de C.V.");
    expect(documento).toContain("Caja &lt;general&gt;");
    expect(documento).toContain("01/11/2026 al 30/11/2026 · Consolidado");
    expect(documento).toContain("La utilidad del período es US$ 150.00");
    expect(documento).toContain("Cifras ilustrativas");
    expect(documento).toContain("Balanza de comprobación");
    expect(documento).toContain("Estado de resultados");
    expect(documento).toContain("Sumas iguales");
    expect(documento).not.toContain("Caja <general>");
  });

  it("genera un XLSX con las diez columnas, la utilidad y las sumas iguales", async () => {
    const archivo = await crearHojaTrabajoExcel(hojaTrabajo, datos, new Date("2026-11-21T12:00:00.000Z"));
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
    const hoja = libro.getWorksheet("Hoja de trabajo");

    expect(archivo.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(hoja?.getCell("A1").value).toBe(datos.empresa);
    expect(hoja?.getCell("A8").value).toBe("110101 Caja <general>");
    expect(hoja?.getCell("A9").value).toBe("Utilidad del ejercicio");
    expect(hoja?.getCell("H9").value).toBe(150);
    expect(hoja?.getCell("K9").value).toBe(150);
    expect(hoja?.getCell("A10").value).toBe("Sumas iguales");
    expect(hoja?.getCell("H10").value).toBe(1000);
    expect(hoja?.getCell("K10").value).toBe(1000);
    expect(hoja?.views[0]?.state).toBe("frozen");
  });
});
