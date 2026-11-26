import type { FilaLibroCompras, LibroCompras, LibroConsumidor, LibroContribuyentes } from "@contable/shared";
import { describe, expect, it } from "vitest";
import { armarAnexosF07, fechaDeAnexo, textoDeAnexo } from "./anexos-f07.js";

const compra = (extra: Partial<FilaLibroCompras> = {}): FilaLibroCompras => ({
  numero: 1,
  documentoId: "d1",
  fecha: "2026-10-05",
  tipoDocumento: "ccf",
  numeroDocumento: "CCF-100",
  nrcProveedor: "123456-7",
  proveedor: "Distribuidora; S.A.",
  concepto: "Equipos",
  sucursal: "Central",
  anulado: false,
  comprasExentas: "0.00",
  comprasNoSujetas: "0.00",
  comprasGravadas: "100.00",
  creditoFiscal: "13.00",
  ivaPercibido: "0.00",
  ivaRetenido: "0.00",
  totalCompras: "113.00",
  ...extra,
});

const cero = "0.00";
const librosVacios = (filas: FilaLibroCompras[]) => {
  const compras: LibroCompras = {
    desde: "2026-10-01",
    hasta: "2026-10-31",
    filas,
    totales: {
      comprasExentas: cero,
      comprasNoSujetas: cero,
      comprasGravadas: cero,
      creditoFiscal: cero,
      ivaPercibido: cero,
      ivaRetenido: cero,
      totalCompras: "113.00",
    },
  };
  const contribuyentes: LibroContribuyentes = {
    desde: compras.desde,
    hasta: compras.hasta,
    filas: [],
    totales: {
      ventasExentas: cero,
      ventasNoSujetas: cero,
      ventasGravadas: cero,
      debitoFiscal: cero,
      ivaPercibido: cero,
      ivaRetenido: cero,
      ventaTotal: cero,
    },
  };
  const consumidor: LibroConsumidor = {
    desde: compras.desde,
    hasta: compras.hasta,
    filas: [],
    totales: {
      ventasExentas: cero,
      ventasNoSujetas: cero,
      ventasGravadas: cero,
      ivaIncluido: cero,
      exportaciones: cero,
      totalVentas: cero,
    },
  };
  return { compras, contribuyentes, consumidor };
};

describe("armarAnexosF07", () => {
  it("da formato de portal: fecha dd/mm/aaaa, punto y coma, punto decimal y sin encabezado", () => {
    const l = librosVacios([compra()]);
    const { anexos } = armarAnexosF07(l.compras, l.contribuyentes, l.consumidor);
    const compras = anexos[0]!;
    expect(compras.errores).toEqual([]);
    expect(compras.csv).toBe(
      "05/10/2026;CCF;CCF-100;123456-7;Distribuidora S.A.;0.00;0.00;100.00;13.00;0.00;0.00;113.00\r\n",
    );
    expect(compras.total).toBe("113.00");
    expect(anexos.map((a) => a.id)).toEqual(["compras", "contribuyentes", "consumidor"]);
  });

  it("un CCF sin NRC del proveedor deja el anexo con error y sin CSV", () => {
    const l = librosVacios([compra({ nrcProveedor: null })]);
    const compras = armarAnexosF07(l.compras, l.contribuyentes, l.consumidor).anexos[0]!;
    expect(compras.csv).toBe("");
    expect(compras.errores).toEqual([
      { fila: 1, columna: "NRC", referencia: "CCF CCF-100", mensaje: "Falta «NRC» en CCF CCF-100." },
    ]);
  });

  it("una factura de quien no es contribuyente no exige NRC, pero sí el nombre", () => {
    const l = librosVacios([
      compra({ tipoDocumento: "factura", numeroDocumento: "F-1", nrcProveedor: null, proveedor: "" }),
    ]);
    const compras = armarAnexosF07(l.compras, l.contribuyentes, l.consumidor).anexos[0]!;
    expect(compras.errores.map((e) => e.columna)).toEqual(["Proveedor"]);
  });

  it("un anexo sin registros no tiene errores ni contenido", () => {
    const l = librosVacios([]);
    const anexo = armarAnexosF07(l.compras, l.contribuyentes, l.consumidor).anexos[1]!;
    expect(anexo).toMatchObject({ filas: [], errores: [], csv: "" });
  });
});

describe("formato de campos", () => {
  it("convierte la fecha y limpia separadores y saltos de línea", () => {
    expect(fechaDeAnexo("2026-01-09")).toBe("09/01/2026");
    expect(textoDeAnexo('A;B "C"\nD')).toBe("A B C D");
    expect(textoDeAnexo(null)).toBe("");
  });
});
