import type { UnidadBalanza } from "../../reportes/domain/repositorio-balanza.js";
import type { ConsultaDocumentosLibro, DocumentoLibro } from "./libros-iva.js";

/** Lo que los libros de IVA leen de la base: el acceso y el ejercicio (como los reportes) y los documentos. */
export interface UnidadLibrosIva extends UnidadBalanza {
  /**
   * Documentos de compra o venta del período cuya partida está contabilizada o anulada, nunca en borrador,
   * con el tercero y la descripción de sus líneas.
   */
  documentosDelLibro(consulta: ConsultaDocumentosLibro): Promise<DocumentoLibro[]>;
}

export interface RepositorioLibrosIva {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadLibrosIva) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_LIBROS_IVA = Symbol("RepositorioLibrosIva");
