import { describe, expect, it } from "vitest";
import type { LibroCompras } from "@contable/shared";
import { crearLibroIvaExcel } from "./libro-excel";
import { libroComprasTabular } from "./libro-compras";
import { crearDocumentoLibroIva } from "./libro-pdf";

const compras: LibroCompras = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  filas: [
    {
      numero: 1,
      documentoId: "d1",
      fecha: "2026-10-01",
      tipoDocumento: "ccf",
      numeroDocumento: "CCF-P001",
      nrcProveedor: "301245-7",
      proveedor: "Totalynk <El Salvador>",
      concepto: "Mercadería para la venta",
      sucursal: "Casa matriz",
      anulado: false,
      comprasExentas: "0.00",
      comprasNoSujetas: "0.00",
      comprasGravadas: "11670.00",
      creditoFiscal: "1517.10",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      totalCompras: "13187.10",
    },
    {
      numero: 2,
      documentoId: "d2",
      fecha: "2026-10-15",
      tipoDocumento: "factura",
      numeroDocumento: "FAC-AN5587",
      nrcProveedor: null,
      proveedor: "ANDA",
      concepto: "Servicio de agua",
      sucursal: "Casa matriz",
      anulado: true,
      comprasExentas: "0.00",
      comprasNoSujetas: "0.00",
      comprasGravadas: "0.00",
      creditoFiscal: "0.00",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      totalCompras: "0.00",
    },
  ],
  totales: {
    comprasExentas: "0.00",
    comprasNoSujetas: "0.00",
    comprasGravadas: "11670.00",
    creditoFiscal: "1517.10",
    ivaPercibido: "0.00",
    ivaRetenido: "0.00",
    totalCompras: "13187.10",
  },
};
const datos = { empresa: "CheroPhonex <S.A.>", alcance: "Consolidado", nrc: "312456-7" };

describe("libro de compras como tabla", () => {
  it("lleva las columnas legales y N/A cuando el proveedor no tiene NRC", () => {
    const t = libroComprasTabular(compras);
    expect(t.columnas.map((c) => c.titulo)).toContain("IVA crédito fiscal");
    expect(t.filas[0]).toMatchObject({ nrc: "301245-7", tipo: "CCF", creditoFiscal: "1517.10" });
    expect(t.filas[1]).toMatchObject({ nrc: "N/A", tipo: "Factura", anulado: true });
    expect(t.totales["total"]).toBe("13187.10");
  });

  it("el PDF escapa el HTML, marca el anulado y trae los totales", () => {
    const html = crearDocumentoLibroIva(libroComprasTabular(compras), datos);
    expect(html).toContain("CheroPhonex &lt;S.A.&gt; · NRC 312456-7");
    expect(html).toContain("Totalynk &lt;El Salvador&gt;");
    expect(html).not.toContain("Totalynk <El Salvador>");
    expect(html).toContain('class="anulado"');
    expect(html).toContain("01/10/2026 al 31/10/2026 · Consolidado");
    expect(html).toContain("13,187.10");
    expect(html).toContain("TOTALES");
  });

  it("el Excel trae montos numéricos y la fila de totales", async () => {
    const archivo = await crearLibroIvaExcel(
      libroComprasTabular(compras),
      datos,
      new Date("2026-11-21T12:00:00Z"),
    );
    const exceljs = await import("exceljs");
    const ExcelJS = (exceljs as unknown as { default?: typeof exceljs }).default ?? exceljs;
    const libro = new ExcelJS.Workbook();
    const contenido = await new Promise<ArrayBuffer>((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result as ArrayBuffer);
      lector.onerror = () => rechazar(lector.error);
      lector.readAsArrayBuffer(archivo);
    });
    await libro.xlsx.load(contenido);
    const hoja = libro.getWorksheet("Libro de IVA")!;
    expect(hoja.getCell("A2").value).toBe("Libro de compras");
    const ultima = hoja.getRow(hoja.rowCount);
    expect(ultima.getCell(1).value).toBe("TOTALES");
    expect(ultima.getCell(14).value).toBe(13187.1);
    expect(hoja.getRow(6).getCell(11).value).toBe(1517.1);
  });
});
