import type { FirmarEstado } from "@contable/shared";
import type { DocumentoEstado } from "../exportacion/documento-estado";

/**
 * Convierte el estado que la web exporta en el cuerpo que recibe `POST /estados-firmados`: el mismo título,
 * período, columnas y filas (sin el `id` interno de cada fila). No se calcula ni se formatea ningún monto: los
 * valores viajan tal como los exporta la web.
 *
 * TODO(Carlos): la API arma el PDF solo con título, período, alcance, columnas y filas. Hoy la web exporta
 * además el logotipo, los nombres del propietario y del contador con su inscripción (firmas del documento) y las
 * notas a los estados (anexo), pero el contrato `firmarEstadoSchema` no los acepta; por eso no se envían y el PDF
 * firmado no los incluye. Cuando el contrato los admita, agregarlos aquí.
 */
export function documentoAFirma(documento: DocumentoEstado, alcance: string, cargo?: string): FirmarEstado {
  const cargoLimpio = cargo?.trim();
  return {
    titulo: documento.titulo,
    periodo: documento.periodo,
    alcance,
    ...(cargoLimpio ? { cargo: cargoLimpio } : {}),
    columnas: documento.columnas.map((c) => ({ titulo: c.titulo, tipo: c.tipo })),
    filas: documento.filas.map((f) => ({
      texto: f.texto,
      tipo: f.tipo,
      ...(f.valores && f.valores.length > 0 ? { valores: [...f.valores] } : {}),
    })),
  };
}
