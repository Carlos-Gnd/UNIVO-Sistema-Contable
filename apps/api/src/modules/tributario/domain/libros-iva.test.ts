import { describe, expect, it } from "vitest";
import { armarLibroCompras, armarLibroContribuyentes, type DocumentoLibro } from "./libros-iva.js";

const base = {
  sucursalId: "s1",
  sucursal: "Casa matriz",
  numeroDocumentoHasta: null,
  totalExento: "0.00",
  totalNoSujeto: "0.00",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  anulado: false,
} as const;

/** Las 11 compras de octubre del libro de CheroPhonex (hoja 5). */
const compras: DocumentoLibro[] = [
  [
    "01",
    "CCF-P001",
    "301245-7",
    "Totalynk El Salvador",
    "Mercadería para la venta",
    "11670.00",
    "1517.10",
    "13187.10",
  ],
  [
    "02",
    "CCF-P002",
    "187652-0",
    "SP Importadora",
    "Mercadería para la venta",
    "11800.00",
    "1534.00",
    "13334.00",
  ],
  [
    "03",
    "CCF-P003",
    "254398-2",
    "A1A Solutions",
    "Mercadería para la venta",
    "11720.00",
    "1523.60",
    "13243.60",
  ],
  [
    "04",
    "CCF-P004",
    "299871-4",
    "Protectores por Mayor",
    "Mercadería para la venta",
    "4810.00",
    "625.30",
    "5435.30",
  ],
  [
    "05",
    "CCF-A0101",
    "210457-9",
    "Inmobiliaria Roosevelt, S.A. de C.V.",
    "Alquiler del local - octubre",
    "600.00",
    "78.00",
    "678.00",
  ],
  ["15", "CCF-E2231", "100231-4", "EEO, S.A. de C.V.", "Energía eléctrica", "150.00", "19.50", "169.50"],
  [
    "15",
    "CCF-T7741",
    "156320-1",
    "Telecom Oriente, S.A. de C.V.",
    "Internet y telefonía",
    "60.00",
    "7.80",
    "67.80",
  ],
  [
    "22",
    "CCF-L0412",
    "213654-0",
    "Librería y Papelería San Miguel",
    "Papelería y útiles",
    "50.00",
    "6.50",
    "56.50",
  ],
  [
    "22",
    "CCF-L0413",
    "213654-0",
    "Librería y Papelería San Miguel",
    "Material de aseo",
    "40.00",
    "5.20",
    "45.20",
  ],
  [
    "28",
    "CCF-P0920",
    "248761-3",
    "Publicidad Oriental, S.A. de C.V.",
    "Publicidad en redes y volantes",
    "200.00",
    "26.00",
    "226.00",
  ],
].map(([dia, numero, nrc, tercero, concepto, gravado, iva, total], i) => ({
  ...base,
  id: `d${i}`,
  fecha: `2026-10-${dia}`,
  tipoDocumento: "ccf" as const,
  numeroDocumento: numero!,
  nrc: nrc!,
  tercero: tercero!,
  concepto: concepto!,
  totalGravado: gravado!,
  iva: iva!,
  total: total!,
}));
const anda: DocumentoLibro = {
  ...base,
  id: "anda",
  fecha: "2026-10-15",
  tipoDocumento: "factura",
  numeroDocumento: "FAC-AN5587",
  nrc: null,
  tercero: "ANDA",
  concepto: "Servicio de agua",
  totalGravado: "0.00",
  totalExento: "25.00",
  iva: "0.00",
  total: "25.00",
};

describe("libro de compras", () => {
  const libro = armarLibroCompras({ desde: "2026-10-01", hasta: "2026-10-31" }, [anda, ...compras].reverse());

  it("ordena por fecha y número de documento y numera los renglones", () => {
    expect(libro.filas.map((f) => f.numeroDocumento)).toEqual([
      "CCF-P001",
      "CCF-P002",
      "CCF-P003",
      "CCF-P004",
      "CCF-A0101",
      "CCF-E2231",
      "CCF-T7741",
      "FAC-AN5587",
      "CCF-L0412",
      "CCF-L0413",
      "CCF-P0920",
    ]);
    expect(libro.filas.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("coincide con los totales del libro de CheroPhonex de octubre al centavo", () => {
    expect(libro.totales).toEqual({
      comprasExentas: "25.00",
      comprasNoSujetas: "0.00",
      comprasGravadas: "41100.00",
      creditoFiscal: "5343.00",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      totalCompras: "46468.00",
    });
  });

  it("un documento anulado se lista pero no suma", () => {
    const con = armarLibroCompras({ desde: "2026-10-01", hasta: "2026-10-31" }, [
      ...compras,
      { ...anda, anulado: true },
    ]);
    const fila = con.filas.find((f) => f.numeroDocumento === "FAC-AN5587")!;
    expect(fila.anulado).toBe(true);
    expect(fila.totalCompras).toBe("0.00");
    expect(con.totales.totalCompras).toBe("46443.00");
    expect(con.totales.creditoFiscal).toBe("5343.00");
  });

  it("sin documentos, el libro queda en ceros", () => {
    const vacio = armarLibroCompras({ desde: "2026-11-01", hasta: "2026-11-30" }, []);
    expect(vacio.filas).toEqual([]);
    expect(vacio.totales.totalCompras).toBe("0.00");
  });
});

/** Los ocho CCF de octubre del libro de ventas a contribuyentes de CheroPhonex (hoja 6). */
const ccf: DocumentoLibro[] = [
  ["08", "0001", "245871-3", "Tecno Plaza San Miguel, S.A. de C.V.", "2740.50", "356.27", "3096.77"],
  ["10", "0002", "198342-6", "Celulares El Oriente, S.A. de C.V.", "3152.25", "409.79", "3562.04"],
  ["15", "0003", "276510-1", "Comercial Chaparrastique, S.A. de C.V.", "3928.50", "510.71", "4439.21"],
  ["17", "0004", "231984-8", "Distribuidora La Ceiba, S.A. de C.V.", "4627.80", "601.61", "5229.41"],
  ["22", "0005", "264017-5", "MultiCell Usulután, S.A. de C.V.", "2218.05", "288.35", "2506.40"],
  ["24", "0006", "245871-3", "Tecno Plaza San Miguel, S.A. de C.V.", "2582.55", "335.73", "2918.28"],
  ["29", "0007", "198342-6", "Celulares El Oriente, S.A. de C.V.", "3325.05", "432.26", "3757.31"],
  ["31", "0008", "276510-1", "Comercial Chaparrastique, S.A. de C.V.", "3048.30", "396.28", "3444.58"],
].map(([dia, n, nrc, cliente, gravado, iva, total], i) => ({
  ...base,
  id: `v${i}`,
  fecha: `2026-10-${dia}`,
  tipoDocumento: "ccf" as const,
  numeroDocumento: `CCF-${n}`,
  nrc: nrc!,
  tercero: cliente!,
  concepto: "Venta",
  totalGravado: gravado!,
  iva: iva!,
  total: total!,
}));

describe("libro de ventas a contribuyentes", () => {
  const periodo = { desde: "2026-10-01", hasta: "2026-10-31" };

  it("coincide con los totales del libro de CheroPhonex de octubre al centavo", () => {
    const libro = armarLibroContribuyentes(periodo, [...ccf].reverse());
    expect(libro.filas.map((f) => f.numeroDocumento)).toEqual(ccf.map((d) => d.numeroDocumento));
    expect(libro.filas.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(libro.totales).toEqual({
      ventasExentas: "0.00",
      ventasNoSujetas: "0.00",
      ventasGravadas: "25623.00",
      debitoFiscal: "3331.00",
      ivaPercibido: "0.00",
      ivaRetenido: "0.00",
      ventaTotal: "28954.00",
    });
  });

  it("el IVA retenido y el percibido se muestran por separado y el total no descuenta lo retenido", () => {
    const libro = armarLibroContribuyentes(periodo, [
      {
        ...ccf[0]!,
        id: "g",
        totalGravado: "1000.00",
        iva: "130.00",
        ivaRetenido: "10.00",
        total: "1130.00",
      },
      { ...ccf[1]!, id: "p", totalGravado: "500.00", iva: "65.00", ivaPercibido: "5.00", total: "570.00" },
    ]);
    expect(libro.totales).toMatchObject({
      debitoFiscal: "195.00",
      ivaRetenido: "10.00",
      ivaPercibido: "5.00",
      ventaTotal: "1700.00",
    });
  });

  it("un CCF anulado se lista sin montos y no suma al débito fiscal", () => {
    const libro = armarLibroContribuyentes(periodo, [...ccf.slice(0, 2), { ...ccf[2]!, anulado: true }]);
    expect(libro.filas[2]).toMatchObject({ anulado: true, debitoFiscal: "0.00", ventaTotal: "0.00" });
    expect(libro.totales.debitoFiscal).toBe("766.06");
  });
});
