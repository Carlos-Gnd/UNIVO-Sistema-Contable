import {
  Dinero,
  type FilaLibroCompras,
  type FilaLibroConsumidor,
  type FilaLibroContribuyentes,
  type LibroCompras,
  type LibroConsumidor,
  type LibroContribuyentes,
  type TotalesLibroCompras,
  type TotalesLibroConsumidor,
  type TotalesLibroContribuyentes,
} from "@contable/shared";

/** Documento de compra o venta tal como sale de la base para un libro de IVA (partida contabilizada o anulada). */
export interface DocumentoLibro {
  id: string;
  /** AAAA-MM-DD */
  fecha: string;
  sucursalId: string;
  sucursal: string;
  tipoDocumento: "ccf" | "factura" | "exportacion";
  numeroDocumento: string;
  /** Último número de un resumen de facturas de consumidor final */
  numeroDocumentoHasta: string | null;
  /** NRC del tercero; nulo si no lo tiene o no hay tercero */
  nrc: string | null;
  /** Nombre del proveedor o cliente; nulo en una venta a consumidor final sin identificar */
  tercero: string | null;
  /** Descripción de lo comprado: la de sus líneas */
  concepto: string;
  totalGravado: string;
  totalExento: string;
  totalNoSujeto: string;
  iva: string;
  ivaPercibido: string;
  ivaRetenido: string;
  total: string;
  /** La partida del documento fue anulada: sigue en el libro pero sin montos */
  anulado: boolean;
}

/** Lo que se pide a la base para un libro: el período, la operación, los tipos de documento y las sucursales (null = todas). */
export interface ConsultaDocumentosLibro {
  empresaId: string;
  operacion: "compra" | "venta";
  tipos: readonly ("ccf" | "factura" | "exportacion")[];
  desde: string;
  hasta: string;
  sucursales: readonly string[] | null;
}

/** Orden de un libro: por fecha y, dentro del día, por número de documento. */
export function ordenarDocumentos<T extends { fecha: string; numeroDocumento: string }>(
  docs: readonly T[],
): T[] {
  return [...docs].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.numeroDocumento.localeCompare(b.numeroDocumento, "es"),
  );
}

/** Monto de un documento en el libro: un documento anulado no suma. */
export function montoEnLibro(valor: string, anulado: boolean): string {
  return anulado ? Dinero.cero().aTexto() : Dinero.de(valor).aTexto();
}

/**
 * Libro de compras (HU-45): una fila por documento del proveedor, con el crédito fiscal del CCF. Un documento
 * con la partida anulada se lista como anulado y no suma; los totales salen de sumar los renglones con Dinero.
 */
export function armarLibroCompras(
  periodo: { desde: string; hasta: string },
  documentos: readonly DocumentoLibro[],
): LibroCompras {
  const filas: FilaLibroCompras[] = ordenarDocumentos(documentos).map((d, i) => ({
    numero: i + 1,
    documentoId: d.id,
    fecha: d.fecha,
    tipoDocumento: d.tipoDocumento === "ccf" ? "ccf" : "factura",
    numeroDocumento: d.numeroDocumento,
    nrcProveedor: d.nrc,
    proveedor: d.tercero ?? "",
    concepto: d.concepto,
    sucursal: d.sucursal,
    anulado: d.anulado,
    comprasExentas: montoEnLibro(d.totalExento, d.anulado),
    comprasNoSujetas: montoEnLibro(d.totalNoSujeto, d.anulado),
    comprasGravadas: montoEnLibro(d.totalGravado, d.anulado),
    creditoFiscal: montoEnLibro(d.iva, d.anulado),
    ivaPercibido: montoEnLibro(d.ivaPercibido, d.anulado),
    ivaRetenido: montoEnLibro(d.ivaRetenido, d.anulado),
    totalCompras: montoEnLibro(d.total, d.anulado),
  }));
  const suma = (campo: keyof TotalesLibroCompras) => Dinero.sumar(filas.map((f) => f[campo])).aTexto();
  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    filas,
    totales: {
      comprasExentas: suma("comprasExentas"),
      comprasNoSujetas: suma("comprasNoSujetas"),
      comprasGravadas: suma("comprasGravadas"),
      creditoFiscal: suma("creditoFiscal"),
      ivaPercibido: suma("ivaPercibido"),
      ivaRetenido: suma("ivaRetenido"),
      totalCompras: suma("totalCompras"),
    },
  };
}

/**
 * Libro de ventas a contribuyentes (HU-46): una fila por CCF emitido, con su débito fiscal, el IVA percibido
 * y el retenido por el cliente. Un CCF con la partida anulada se lista como anulado y no suma.
 */
export function armarLibroContribuyentes(
  periodo: { desde: string; hasta: string },
  documentos: readonly DocumentoLibro[],
): LibroContribuyentes {
  const filas: FilaLibroContribuyentes[] = ordenarDocumentos(documentos).map((d, i) => ({
    numero: i + 1,
    documentoId: d.id,
    fecha: d.fecha,
    tipoDocumento: "ccf",
    numeroDocumento: d.numeroDocumento,
    nrcCliente: d.nrc,
    cliente: d.tercero ?? "",
    sucursal: d.sucursal,
    anulado: d.anulado,
    ventasExentas: montoEnLibro(d.totalExento, d.anulado),
    ventasNoSujetas: montoEnLibro(d.totalNoSujeto, d.anulado),
    ventasGravadas: montoEnLibro(d.totalGravado, d.anulado),
    debitoFiscal: montoEnLibro(d.iva, d.anulado),
    ivaPercibido: montoEnLibro(d.ivaPercibido, d.anulado),
    ivaRetenido: montoEnLibro(d.ivaRetenido, d.anulado),
    ventaTotal: montoEnLibro(d.total, d.anulado),
  }));
  const suma = (campo: keyof TotalesLibroContribuyentes) => Dinero.sumar(filas.map((f) => f[campo])).aTexto();
  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    filas,
    totales: {
      ventasExentas: suma("ventasExentas"),
      ventasNoSujetas: suma("ventasNoSujetas"),
      ventasGravadas: suma("ventasGravadas"),
      debitoFiscal: suma("debitoFiscal"),
      ivaPercibido: suma("ivaPercibido"),
      ivaRetenido: suma("ivaRetenido"),
      ventaTotal: suma("ventaTotal"),
    },
  };
}

const comparar = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/**
 * Libro de ventas a consumidor final (HU-47): resumen diario por rango de facturas. Los documentos del mismo día y
 * sucursal (facturas sueltas, resúmenes registrados con su «hasta» y exportaciones) forman un renglón que va del
 * primer al último número. Un documento anulado sigue ocupando su número en el rango pero no suma.
 */
export function armarLibroConsumidor(
  periodo: { desde: string; hasta: string },
  documentos: readonly DocumentoLibro[],
): LibroConsumidor {
  const grupos = new Map<string, DocumentoLibro[]>();
  for (const d of ordenarDocumentos(documentos)) {
    const clave = `${d.fecha}|${d.sucursal}|${d.sucursalId}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), d]);
  }
  const filas: FilaLibroConsumidor[] = [...grupos.values()].map((docs, i) => {
    const primero = docs[0]!;
    const numeros = docs.flatMap((d) => [d.numeroDocumento, d.numeroDocumentoHasta ?? d.numeroDocumento]);
    const vigentes = docs.filter((d) => !d.anulado);
    const suma = (valor: (d: DocumentoLibro) => string) => Dinero.sumar(vigentes.map(valor)).aTexto();
    const factura = vigentes.filter((d) => d.tipoDocumento !== "exportacion");
    const sumaFacturas = (valor: (d: DocumentoLibro) => string) => Dinero.sumar(factura.map(valor)).aTexto();
    return {
      numero: i + 1,
      fecha: primero.fecha,
      sucursal: primero.sucursal,
      del: [...numeros].sort(comparar)[0]!,
      al: [...numeros].sort(comparar).at(-1)!,
      documentos: docs.length,
      ventasExentas: sumaFacturas((d) => d.totalExento),
      ventasNoSujetas: suma((d) => d.totalNoSujeto),
      ventasGravadas: suma((d) => d.totalGravado),
      ivaIncluido: suma((d) => d.iva),
      exportaciones: Dinero.sumar(
        vigentes.filter((d) => d.tipoDocumento === "exportacion").map((d) => d.totalExento),
      ).aTexto(),
      totalVentas: suma((d) => d.total),
    };
  });
  const total = (campo: keyof TotalesLibroConsumidor) => Dinero.sumar(filas.map((f) => f[campo])).aTexto();
  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    filas,
    totales: {
      ventasExentas: total("ventasExentas"),
      ventasNoSujetas: total("ventasNoSujetas"),
      ventasGravadas: total("ventasGravadas"),
      ivaIncluido: total("ivaIncluido"),
      exportaciones: total("exportaciones"),
      totalVentas: total("totalVentas"),
    },
  };
}
