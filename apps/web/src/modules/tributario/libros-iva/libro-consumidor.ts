import type { LibroConsumidor } from "@contable/shared";
import { TEXTOS_LIBROS_IVA as T } from "./textos";
import type { ColumnaLibro, LibroTabular } from "./libro-tabular";

const C = T.consumidor.columnas;

export const COLUMNAS_CONSUMIDOR: readonly ColumnaLibro[] = [
  { clave: "numero", titulo: C.numero, tipo: "texto" },
  { clave: "fecha", titulo: C.fecha, tipo: "texto" },
  { clave: "del", titulo: C.del, tipo: "texto" },
  { clave: "al", titulo: C.al, tipo: "texto" },
  { clave: "sucursal", titulo: C.sucursal, tipo: "texto" },
  { clave: "exentas", titulo: C.exentas, tipo: "monto" },
  { clave: "noSujetas", titulo: C.noSujetas, tipo: "monto" },
  { clave: "gravadas", titulo: C.gravadas, tipo: "monto" },
  { clave: "ivaIncluido", titulo: C.ivaIncluido, tipo: "monto" },
  { clave: "exportaciones", titulo: C.exportaciones, tipo: "monto" },
  { clave: "total", titulo: C.total, tipo: "monto" },
];

/** Libro de ventas a consumidor final como tabla: un renglón por día y sucursal, del primer al último número. */
export function libroConsumidorTabular(libro: LibroConsumidor): LibroTabular {
  return {
    titulo: T.consumidor.titulo,
    columnas: COLUMNAS_CONSUMIDOR,
    desde: libro.desde,
    hasta: libro.hasta,
    filas: libro.filas.map((f) => ({
      id: `${f.fecha}|${f.sucursal}|${f.del}`,
      anulado: false,
      numero: String(f.numero),
      fecha: f.fecha,
      del: f.del,
      al: f.al,
      sucursal: f.sucursal,
      exentas: f.ventasExentas,
      noSujetas: f.ventasNoSujetas,
      gravadas: f.ventasGravadas,
      ivaIncluido: f.ivaIncluido,
      exportaciones: f.exportaciones,
      total: f.totalVentas,
    })),
    totales: {
      exentas: libro.totales.ventasExentas,
      noSujetas: libro.totales.ventasNoSujetas,
      gravadas: libro.totales.ventasGravadas,
      ivaIncluido: libro.totales.ivaIncluido,
      exportaciones: libro.totales.exportaciones,
      total: libro.totales.totalVentas,
    },
  };
}
