/** Identificador de cada anexo del F-07 que se carga en el portal de Hacienda (HU-51). */
export type IdAnexoF07 = "compras" | "contribuyentes" | "consumidor";

/** Un campo obligatorio vacío o inválido: dice en qué renglón del anexo y qué columna falta. */
export interface ErrorAnexoF07 {
  /** Número de renglón dentro del anexo, desde 1 */
  fila: number;
  columna: string;
  /** Documento o rango que origina el renglón, para encontrarlo en el libro */
  referencia: string;
  mensaje: string;
}

/** Un anexo del F-07: sus columnas, sus renglones y el CSV listo para cargar. Solo se puede descargar si no tiene errores. */
export interface AnexoF07 {
  id: IdAnexoF07;
  nombre: string;
  /** Nombre sugerido del archivo, sin la extensión ni el período */
  archivo: string;
  columnas: string[];
  /** Renglones ya con el formato del archivo (fecha dd/mm/aaaa, montos con punto decimal) */
  filas: string[][];
  /** Suma del total del anexo, igual a la del libro de origen */
  total: string;
  errores: ErrorAnexoF07[];
  /** Contenido del CSV: separador punto y coma, punto decimal, sin encabezado; vacío si hay errores */
  csv: string;
}

/** Los tres anexos del F-07 de un período, armados desde los libros de IVA. */
export interface AnexosF07Vista {
  desde: string;
  hasta: string;
  anexos: AnexoF07[];
}
