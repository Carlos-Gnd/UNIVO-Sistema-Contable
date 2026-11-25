import { Injectable } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { UnidadPrisma } from "../../reportes/infrastructure/repositorio-balanza.prisma.js";
import type { ConsultaDocumentosLibro, DocumentoLibro } from "../domain/libros-iva.js";
import type { RepositorioLibrosIva, UnidadLibrosIva } from "../domain/repositorio-libros-iva.js";

interface FilaSql {
  id: string;
  fecha: string;
  sucursal_id: string;
  sucursal: string;
  tipo_documento: DocumentoLibro["tipoDocumento"];
  numero_documento: string;
  numero_documento_hasta: string | null;
  nrc: string | null;
  tercero: string | null;
  concepto: string;
  total_gravado: string;
  total_exento: string;
  total_no_sujeto: string;
  iva: string;
  iva_percibido: string;
  iva_retenido: string;
  total: string;
  anulado: boolean;
}

class UnidadLibrosIvaPrisma extends UnidadPrisma implements UnidadLibrosIva {
  /**
   * Una fila por documento. Solo cuentan los documentos cuya partida está contabilizada o anulada: el que sigue
   * en borrador no entra en el libro. El concepto reúne las descripciones de sus líneas.
   */
  async documentosDelLibro(c: ConsultaDocumentosLibro): Promise<DocumentoLibro[]> {
    const todas = c.sucursales === null;
    const filas = await this.tx.$queryRaw<FilaSql[]>`
      SELECT d.id::text AS id, to_char(d.fecha, 'YYYY-MM-DD') AS fecha, d.sucursal_id::text AS sucursal_id,
             s.nombre AS sucursal, d.tipo_documento::text AS tipo_documento, d.numero_documento,
             d.numero_documento_hasta, t.nrc, t.nombre AS tercero,
             COALESCE(NULLIF(d.observaciones, ''),
               (SELECT string_agg(l.descripcion, '; ' ORDER BY l.orden)
                FROM documentos_comerciales_lineas l WHERE l.documento_id = d.id), '') AS concepto,
             d.total_gravado::text AS total_gravado, d.total_exento::text AS total_exento,
             d.total_no_sujeto::text AS total_no_sujeto, d.iva::text AS iva,
             d.iva_percibido::text AS iva_percibido, d.iva_retenido::text AS iva_retenido,
             d.total::text AS total, (p.estado = 'anulada') AS anulado
      FROM documentos_comerciales d
      JOIN partidas p ON p.id = d.partida_id
      JOIN sucursales s ON s.id = d.sucursal_id
      LEFT JOIN terceros t ON t.id = d.tercero_id AND t.empresa_id = d.empresa_id
      WHERE d.empresa_id = ${c.empresaId}::uuid
        AND d.operacion = ${c.operacion}::operacion_comercial
        AND d.tipo_documento = ANY(${[...c.tipos]}::tipo_documento_comercial[])
        AND p.estado IN ('contabilizada', 'anulada')
        AND d.fecha BETWEEN ${c.desde}::date AND ${c.hasta}::date
        AND (${todas} OR d.sucursal_id = ANY(${[...(c.sucursales ?? [])]}::uuid[]))
      ORDER BY d.fecha, d.numero_documento, d.id`;
    return filas.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      sucursalId: f.sucursal_id,
      sucursal: f.sucursal,
      tipoDocumento: f.tipo_documento,
      numeroDocumento: f.numero_documento,
      numeroDocumentoHasta: f.numero_documento_hasta,
      nrc: f.nrc,
      tercero: f.tercero,
      concepto: f.concepto,
      totalGravado: f.total_gravado,
      totalExento: f.total_exento,
      totalNoSujeto: f.total_no_sujeto,
      iva: f.iva,
      ivaPercibido: f.iva_percibido,
      ivaRetenido: f.iva_retenido,
      total: f.total,
      anulado: f.anulado,
    }));
  }
}

@Injectable()
export class RepositorioLibrosIvaPrisma implements RepositorioLibrosIva {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadLibrosIva) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadLibrosIvaPrisma(tx)));
  }
}
