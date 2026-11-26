import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";
import { formatoEstadosSchema, type FormatoEstados } from "./enums";

/** Estados que se pueden comparar entre períodos (HU-43). */
export const ESTADOS_COMPARABLES = ["resultados", "balance-general"] as const;
export const estadoComparableSchema = z.enum(ESTADOS_COMPARABLES, { error: "Estado inválido." });
export type EstadoComparable = z.infer<typeof estadoComparableSchema>;

/**
 * Consulta de un estado comparativo: el período A (el actual) frente al período B (la base). El estado de
 * resultados compara períodos (desde y hasta de cada uno); el balance general compara fechas, así que de cada
 * período solo cuenta la fecha final (hasta).
 */
export const consultaComparativoSchema = z
  .object({
    estado: estadoComparableSchema,
    desdeA: fechaSchema.optional(),
    hastaA: fechaSchema,
    desdeB: fechaSchema.optional(),
    hastaB: fechaSchema,
    /** Sin sucursal, el estado es consolidado (de las sucursales a las que el usuario tiene acceso) */
    sucursalId: idSchema.optional(),
    /** Formato de presentación; sin él se usa el que la empresa tiene configurado */
    formato: formatoEstadosSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.estado !== "resultados") return;
    for (const p of ["A", "B"] as const) {
      const desde = c[`desde${p}`];
      const hasta = c[`hasta${p}`];
      if (!desde) {
        ctx.addIssue({
          code: "custom",
          path: [`desde${p}`],
          message: "Indique la fecha inicial del período.",
        });
      } else if (desde > hasta) {
        ctx.addIssue({
          code: "custom",
          path: [`desde${p}`],
          message: "La fecha inicial no puede ser posterior a la final.",
        });
      }
    }
  });
export type ConsultaComparativo = z.infer<typeof consultaComparativoSchema>;

/** Un período de un comparativo: desde es null en el balance general, que es una fotografía a una fecha. */
export interface PeriodoComparativo {
  desde: string | null;
  hasta: string;
}

/** Una fila del comparativo con el monto de cada período y su variación. */
export interface FilaComparativa {
  id: string;
  texto: string;
  /** Código de la cuenta de mayor; vacío en encabezados, totales y renglones calculados */
  codigo: string;
  tipo: "seccion" | "renglon" | "total" | "resultado";
  /** Sin montos en los encabezados de sección */
  periodoA?: string;
  periodoB?: string;
  /** Período A menos período B: la diferencia exacta, no un cálculo sobre montos redondeados */
  variacion?: string;
  /** Variación entre el valor absoluto de la base, en %; null si el período B está en cero */
  porcentaje?: string | null;
}

/** Estado comparativo de dos períodos con variación absoluta y porcentual (HU-43). */
export interface EstadoComparativo {
  estado: EstadoComparable;
  formato: FormatoEstados;
  /** Nombre del estado en el formato elegido, por ejemplo «Estado de resultados» */
  titulo: string;
  /** null si es consolidado */
  sucursalId: string | null;
  periodoA: PeriodoComparativo;
  periodoB: PeriodoComparativo;
  filas: FilaComparativa[];
}
