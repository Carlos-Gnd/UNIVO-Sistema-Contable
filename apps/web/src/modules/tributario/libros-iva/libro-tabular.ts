/** Una columna de un libro de IVA: texto a la izquierda o monto a la derecha. */
export interface ColumnaLibro {
  clave: string;
  titulo: string;
  tipo: "texto" | "monto";
}

/**
 * Libro de IVA listo para mostrar o exportar: las tres variantes (compras, contribuyentes y consumidor final) se
 * reducen a columnas, filas y totales, y así comparten la tabla, el PDF y el Excel.
 */
export interface LibroTabular {
  titulo: string;
  columnas: readonly ColumnaLibro[];
  filas: readonly FilaTabular[];
  /** Totales por clave de columna de monto; la primera columna lleva la etiqueta TOTALES */
  totales: Readonly<Record<string, string>>;
  desde: string;
  hasta: string;
}

export type FilaTabular = { id: string; anulado: boolean } & Record<string, string | boolean>;

/** Datos de contexto que se imprimen en el encabezado del PDF y del Excel. */
export interface DatosExportacionLibro {
  empresa: string;
  alcance: string;
  nrc?: string | null;
}
