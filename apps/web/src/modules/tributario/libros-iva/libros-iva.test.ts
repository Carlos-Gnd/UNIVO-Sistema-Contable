import { describe, expect, it } from "vitest";
import type { LibroCompras, LibroConsumidor, LibroContribuyentes } from "@contable/shared";
import { crearLibroIvaExcel } from "./libro-excel";
import { libroComprasTabular } from "./libro-compras";
import { libroConsumidorTabular } from "./libro-consumidor";
import { libroContribuyentesTabular } from "./libro-contribuyentes";
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

const ccf: LibroContribuyentes = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  filas: [
    {
      numero: 1,
      documentoId: "v1",
      fecha: "2026-10-08",
      tipoDocumento: "ccf",
      numeroDocumento: "CCF-0001",
      nrcCliente: "245871-3",
      cliente: "Tecno Plaza San Miguel, S.A. de C.V.",
      sucursal: "Casa matriz",
      anulado: false,
      ventasExentas: "0.00",
      ventasNoSujetas: "0.00",
      ventasGravadas: "2740.50",
      debitoFiscal: "356.27",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      ventaTotal: "3096.77",
    },
  ],
  totales: {
    ventasExentas: "0.00",
    ventasNoSujetas: "0.00",
    ventasGravadas: "2740.50",
    debitoFiscal: "356.27",
    ivaPercibido: "0.00",
    ivaRetenido: "0.00",
    ventaTotal: "3096.77",
  },
};

describe("libro de ventas a contribuyentes como tabla", () => {
  it("lleva el débito fiscal, el IVA retenido y el total", () => {
    const t = libroContribuyentesTabular(ccf);
    expect(t.titulo).toBe("Libro de ventas a contribuyentes");
    expect(t.columnas.map((c) => c.titulo)).toEqual(
      expect.arrayContaining(["Débito fiscal IVA", "IVA retenido", "Venta total"]),
    );
    expect(t.filas[0]).toMatchObject({
      tipo: "CCF",
      nrc: "245871-3",
      debitoFiscal: "356.27",
      total: "3096.77",
    });
    expect(t.totales["debitoFiscal"]).toBe("356.27");
  });

  it("el PDF y el Excel usan el mismo formato que el libro de compras", async () => {
    const t = libroContribuyentesTabular(ccf);
    const html = crearDocumentoLibroIva(t, datos);
    expect(html).toContain("Libro de ventas a contribuyentes");
    expect(html).toContain("3,096.77");
    const archivo = await crearLibroIvaExcel(t, datos, new Date("2026-11-21T12:00:00Z"));
    expect(archivo.size).toBeGreaterThan(0);
  });
});

const consumidor: LibroConsumidor = {
  desde: "2026-10-01",
  hasta: "2026-10-31",
  filas: [
    {
      numero: 1,
      fecha: "2026-10-10",
      sucursal: "Casa matriz",
      del: "FCF-00001",
      al: "FCF-00015",
      documentos: 1,
      ventasExentas: "0.00",
      ventasNoSujetas: "0.00",
      ventasGravadas: "3966.30",
      ivaIncluido: "515.62",
      exportaciones: "0.00",
      totalVentas: "4481.92",
    },
  ],
  totales: {
    ventasExentas: "0.00",
    ventasNoSujetas: "0.00",
    ventasGravadas: "3966.30",
    ivaIncluido: "515.62",
    exportaciones: "0.00",
    totalVentas: "4481.92",
  },
};

describe("libro de ventas a consumidor final como tabla", () => {
  it("muestra el rango de facturas del día con su IVA incluido", () => {
    const t = libroConsumidorTabular(consumidor);
    expect(t.titulo).toBe("Libro de ventas a consumidor final");
    expect(t.filas[0]).toMatchObject({
      del: "FCF-00001",
      al: "FCF-00015",
      ivaIncluido: "515.62",
      total: "4481.92",
    });
    expect(t.totales["gravadas"]).toBe("3966.30");
  });

  it("el PDF trae el rango, el IVA incluido y el total", () => {
    const html = crearDocumentoLibroIva(libroConsumidorTabular(consumidor), datos);
    expect(html).toContain("FCF-00015");
    expect(html).toContain("515.62");
    expect(html).toContain("4,481.92");
  });
});
