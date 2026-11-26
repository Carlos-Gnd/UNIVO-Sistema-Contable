import { describe, expect, it } from "vitest";
import type { DocumentoEstado } from "./documento-estado";
import { crearExcel } from "./documento-excel";

const documento: DocumentoEstado = {
  titulo: "Estado de resultados",
  periodo: "Del 01/11/2026 al 30/11/2026",
  columnas: [{ titulo: "US$", tipo: "dinero" }],
  filas: [
    { id: "v", texto: "Ventas", tipo: "seccion" },
    { id: "v1", texto: "5101 · Ventas netas", valores: ["1000.00"], tipo: "renglon" },
    { id: "n", texto: "Utilidad neta", valores: ["1000.00"], tipo: "resultado" },
  ],
  nombreHoja: "Estado de resultados",
  nombreArchivo: "estado-resultados",
};
const encabezado = { empresa: "CheroPhonex, S.A. de C.V.", nit: null, alcance: "Consolidado", logoUrl: null };

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

describe("Excel de un estado con firmas (HU-39, S3-T18)", () => {
  it("incluye el encabezado, los montos numéricos y los espacios de firma", async () => {
    const archivo = await crearExcel(documento, encabezado, {
      incluir: true,
      propietario: "Carlos Hernández",
      contador: "María Rivas",
      registroContador: "1234",
    });
    const hoja = (await abrirLibro(archivo)).getWorksheet("Estado de resultados");

    expect(archivo.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(hoja?.getCell("A1").value).toBe("CheroPhonex, S.A. de C.V.");
    expect(hoja?.getCell("A2").value).toBe("Estado de resultados");
    expect(hoja?.getCell("A3").value).toContain("Del 01/11/2026 al 30/11/2026 · Consolidado");
    expect(hoja?.getCell("A3").value).toContain("dólares");
    expect(hoja?.getCell("A4").value).toBe("Concepto");
    expect(hoja?.getCell("A6").value).toBe("5101 · Ventas netas");
    expect(hoja?.getCell("B6").value).toBe(1000);
    expect(hoja?.getCell("B6").numFmt).toContain("0.00");
    expect(hoja?.getCell("A7").value).toBe("Utilidad neta");
    expect(hoja?.getCell("A10").value).toBe("Carlos Hernández");
    expect(hoja?.getCell("B10").value).toBe("María Rivas");
    expect(hoja?.getCell("A11").value).toBe("Representante legal");
    expect(hoja?.getCell("B11").value).toBe("Contador");
    expect(hoja?.getCell("B12").value).toBe("Inscripción N.º 1234");
    expect(hoja?.views[0]?.state).toBe("frozen");
  });

  it("omite los espacios de firma cuando se desactivan", async () => {
    const archivo = await crearExcel(documento, encabezado, {
      incluir: false,
      propietario: "Carlos Hernández",
      contador: "María Rivas",
      registroContador: "",
    });
    const hoja = (await abrirLibro(archivo)).getWorksheet("Estado de resultados");
    const textos = hoja
      ?.getSheetValues()
      .flat()
      .filter((v) => typeof v === "string");
    expect(textos).not.toContain("Carlos Hernández");
    expect(textos).not.toContain("Representante legal");
  });

  it("con varias columnas, el contador firma en la última", async () => {
    const archivo = await crearExcel(
      {
        ...documento,
        columnas: [
          { titulo: "A", tipo: "dinero" },
          { titulo: "B", tipo: "dinero" },
          { titulo: "Variación %", tipo: "texto" },
        ],
        filas: [{ id: "x", texto: "Efectivo", valores: ["10.00", "5.00", "100.0 %"], tipo: "renglon" }],
      },
      encabezado,
      { incluir: true, propietario: "Ana", contador: "Luis", registroContador: "" },
    );
    const hoja = (await abrirLibro(archivo)).getWorksheet("Estado de resultados");
    expect(hoja?.getCell("D5").value).toBe("100.0 %");
    expect(hoja?.getCell("A8").value).toBe("Ana");
    expect(hoja?.getCell("D8").value).toBe("Luis");
  });
});
