import { Dinero, type FilaLibroCompras, type LibroCompras, type TotalesLibroCompras } from "@contable/shared";

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
