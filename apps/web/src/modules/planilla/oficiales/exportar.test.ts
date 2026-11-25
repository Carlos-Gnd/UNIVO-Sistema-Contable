import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ResultadoPlanillasOficialesVista } from "@contable/shared";
import { crearExcelPlanillaOficial, htmlPlanillaOficial } from "./exportar";

const reporte: ResultadoPlanillasOficialesVista = {
  periodo: "2026-11",
  empleados: [
    {
      empleadoId: "22222222-2222-4222-8222-222222222222",
      nombres: "Ana",
      apellidos: "Pérez <Riesgo>",
      nombreCompleto: "Ana Pérez <Riesgo>",
      dui: "01234567-8",
      numeroIsss: "ISSS-001",
      nup: "NUP-001",
      salarioCotizable: "450.00",
      isssLaboral: "13.50",
      isssPatronal: "33.75",
      afpLaboral: "32.63",
      afpPatronal: "39.38",
    },
  ],
  totales: {
    isss: { salarioCotizable: "450.00", laboral: "13.50", patronal: "33.75", total: "47.25" },
    afp: { salarioCotizable: "450.00", laboral: "32.63", patronal: "39.38", total: "72.01" },
  },
  presentaciones: {},
};

describe("exportación de planillas oficiales", () => {
  it("genera Excel de ISSS con identificadores y totales numéricos", async () => {
    const archivo = await crearExcelPlanillaOficial("isss", reporte);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await archivo.arrayBuffer());
    const hoja = libro.getWorksheet("ISSS")!;
    expect(hoja.getCell("A1").value).toBe("Planilla de ISSS");
    expect(hoja.getRow(5).values).toContain("Número ISSS");
    expect(hoja.getCell("B6").value).toBe("ISSS-001");
    expect(hoja.getCell("F6").value).toBe(13.5);
    expect(hoja.getCell("H6").value).toBe(47.25);
    expect(hoja.getCell("H7").value).toBe(47.25);
    expect(String(hoja.getCell("A3").value).toLocaleLowerCase("es")).toContain("formato genérico");
  });

  it("genera HTML imprimible escapado con el total AFP al centavo", () => {
    const html = htmlPlanillaOficial("afp", reporte);
    expect(html).toContain("Ana Pérez &lt;Riesgo&gt;");
    expect(html).toContain("US$ 32.63");
    expect(html).toContain("US$ 39.38");
    expect(html).toContain("US$ 72.01");
    expect(html).toContain("Número ISSS");
    expect(html).not.toContain("<Riesgo>");
  });
});
