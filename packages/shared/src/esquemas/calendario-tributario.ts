import { z } from "zod";
import { OBLIGACIONES, type EstadoVencimiento, type Obligacion } from "../tributario/calendario";
import { fechaSchema } from "./comunes";

const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "El mes debe tener el formato AAAA-MM." });

/**
 * Consulta del calendario: los vencimientos cuya fecha cae entre `desde` y `hasta` (AAAA-MM-DD, hasta 400 días).
 * `hoy` solo sirve para simular otra fecha; por omisión es la de hoy en El Salvador.
 */
export const consultaCalendarioSchema = z
  .object({ desde: fechaSchema, hasta: fechaSchema, hoy: fechaSchema.optional() })
  .refine((c) => c.desde <= c.hasta, {
    error: "La fecha inicial no puede ser posterior a la final.",
    path: ["desde"],
  })
  .refine((c) => c.hasta.slice(0, 4) <= String(Number(c.desde.slice(0, 4)) + 1), {
    error: "El rango no puede pasar de dos años.",
    path: ["hasta"],
  });
export type ConsultaCalendario = z.infer<typeof consultaCalendarioSchema>;

/** Alerta del tablero: vencimientos sin presentar que vencen en cinco días o menos, y los ya vencidos. */
export const consultaAlertasSchema = z.object({ hoy: fechaSchema.optional() });
export type ConsultaAlertas = z.infer<typeof consultaAlertasSchema>;

export const obligacionSchema = z.enum(OBLIGACIONES, { error: "Obligación inválida." });
export const periodoSchema = mesSchema;

/** Marca un vencimiento como presentado, con una nota opcional (por ejemplo, el número de acuse). */
export const marcarPresentadaSchema = z.object({
  nota: z.string().trim().max(200, { error: "Máximo 200 caracteres." }).optional(),
});
export type MarcarPresentada = z.infer<typeof marcarPresentadaSchema>;

export interface Vencimiento {
  obligacion: Obligacion;
  /** Mes al que corresponde la declaración o la planilla (AAAA-MM) */
  periodo: string;
  titulo: string;
  tipo: "IVA" | "Renta" | "Planilla";
  /** Día hábil en que vence (AAAA-MM-DD) */
  fecha: string;
  estado: EstadoVencimiento;
  /** Días que faltan (negativo si ya venció) */
  diasRestantes: number;
  presentadaEn: string | null;
  nota: string | null;
}

export interface CalendarioTributario {
  hoy: string;
  vencimientos: Vencimiento[];
}

/** Lo que el tablero muestra: los vencimientos próximos o vencidos sin presentar. */
export interface AlertasTributarias {
  hoy: string;
  diasDeAlerta: number;
  alertas: Vencimiento[];
}
