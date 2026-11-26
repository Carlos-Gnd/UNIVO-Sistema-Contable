import type { LibroContribuyentes } from "@contable/shared";
import { TEXTOS_LIBROS_IVA as T } from "./textos";
import type { ColumnaLibro, LibroTabular } from "./libro-tabular";

const C = T.contribuyentes.columnas;

export const COLUMNAS_CONTRIBUYENTES: readonly ColumnaLibro[] = [
  { clave: "numero", titulo: C.numero, tipo: "texto" },
  { clave: "fecha", titulo: C.fecha, tipo: "texto" },
  { clave: "tipo", titulo: C.tipo, tipo: "texto" },
  { clave: "documento", titulo: C.documento, tipo: "texto" },
  { clave: "nrc", titulo: C.nrc, tipo: "texto" },
  { clave: "cliente", titulo: C.cliente, tipo: "texto" },
  { clave: "exentas", titulo: C.exentas, tipo: "monto" },
  { clave: "noSujetas", titulo: C.noSujetas, tipo: "monto" },
  { clave: "gravadas", titulo: C.gravadas, tipo: "monto" },
  { clave: "debitoFiscal", titulo: C.debitoFiscal, tipo: "monto" },
  { clave: "percibido", titulo: C.percibido, tipo: "monto" },
  { clave: "retenido", titulo: C.retenido, tipo: "monto" },
  { clave: "total", titulo: C.total, tipo: "monto" },
];

/** Libro de ventas a contribuyentes como tabla, igual que el de compras para compartir tabla, PDF y Excel. */
export function libroContribuyentesTabular(libro: LibroContribuyentes): LibroTabular {
  return {
    titulo: T.contribuyentes.titulo,
    columnas: COLUMNAS_CONTRIBUYENTES,
    desde: libro.desde,
    hasta: libro.hasta,
    filas: libro.filas.map((f) => ({
      id: f.documentoId,
      anulado: f.anulado,
      numero: String(f.numero),
      fecha: f.fecha,
      tipo: T.contribuyentes.tipos[f.tipoDocumento],
      documento: f.numeroDocumento,
      nrc: f.nrcCliente ?? T.noAplica,
      cliente: f.cliente,
      exentas: f.ventasExentas,
      noSujetas: f.ventasNoSujetas,
      gravadas: f.ventasGravadas,
      debitoFiscal: f.debitoFiscal,
      percibido: f.ivaPercibido,
      retenido: f.ivaRetenido,
      total: f.ventaTotal,
    })),
    totales: {
      exentas: libro.totales.ventasExentas,
      noSujetas: libro.totales.ventasNoSujetas,
      gravadas: libro.totales.ventasGravadas,
      debitoFiscal: libro.totales.debitoFiscal,
      percibido: libro.totales.ivaPercibido,
      retenido: libro.totales.ivaRetenido,
      total: libro.totales.ventaTotal,
    },
  };
}
