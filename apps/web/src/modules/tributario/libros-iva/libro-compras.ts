import type { LibroCompras } from "@contable/shared";
import { TEXTOS_LIBROS_IVA as T } from "./textos";
import type { ColumnaLibro, LibroTabular } from "./libro-tabular";

const C = T.compras.columnas;

export const COLUMNAS_COMPRAS: readonly ColumnaLibro[] = [
  { clave: "numero", titulo: C.numero, tipo: "texto" },
  { clave: "fecha", titulo: C.fecha, tipo: "texto" },
  { clave: "tipo", titulo: C.tipo, tipo: "texto" },
  { clave: "documento", titulo: C.documento, tipo: "texto" },
  { clave: "nrc", titulo: C.nrc, tipo: "texto" },
  { clave: "proveedor", titulo: C.proveedor, tipo: "texto" },
  { clave: "concepto", titulo: C.concepto, tipo: "texto" },
  { clave: "exentas", titulo: C.exentas, tipo: "monto" },
  { clave: "noSujetas", titulo: C.noSujetas, tipo: "monto" },
  { clave: "gravadas", titulo: C.gravadas, tipo: "monto" },
  { clave: "creditoFiscal", titulo: C.creditoFiscal, tipo: "monto" },
  { clave: "percibido", titulo: C.percibido, tipo: "monto" },
  { clave: "retenido", titulo: C.retenido, tipo: "monto" },
  { clave: "total", titulo: C.total, tipo: "monto" },
];

/** Libro de compras como tabla: las fechas quedan en AAAA-MM-DD y la pantalla y las exportaciones las formatean. */
export function libroComprasTabular(libro: LibroCompras): LibroTabular {
  return {
    titulo: T.compras.titulo,
    columnas: COLUMNAS_COMPRAS,
    desde: libro.desde,
    hasta: libro.hasta,
    filas: libro.filas.map((f) => ({
      id: f.documentoId,
      anulado: f.anulado,
      numero: String(f.numero),
      fecha: f.fecha,
      tipo: T.compras.tipos[f.tipoDocumento],
      documento: f.numeroDocumento,
      nrc: f.nrcProveedor ?? T.noAplica,
      proveedor: f.proveedor,
      concepto: f.concepto,
      exentas: f.comprasExentas,
      noSujetas: f.comprasNoSujetas,
      gravadas: f.comprasGravadas,
      creditoFiscal: f.creditoFiscal,
      percibido: f.ivaPercibido,
      retenido: f.ivaRetenido,
      total: f.totalCompras,
    })),
    totales: {
      exentas: libro.totales.comprasExentas,
      noSujetas: libro.totales.comprasNoSujetas,
      gravadas: libro.totales.comprasGravadas,
      creditoFiscal: libro.totales.creditoFiscal,
      percibido: libro.totales.ivaPercibido,
      retenido: libro.totales.ivaRetenido,
      total: libro.totales.totalCompras,
    },
  };
}
