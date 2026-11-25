import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";
import { operacionComercialSchema, tipoDocumentoComercialSchema } from "./comercial";

// ───────────── Antigüedad de saldos (HU-63) ─────────────

/** Tramos por días vencidos al corte: corriente (aún no vence), 1-30, 31-60, 61-90 y más de 90. */
export const TRAMOS_ANTIGUEDAD = ["corriente", "d1_30", "d31_60", "d61_90", "mas_90"] as const;
export type TramoAntiguedad = (typeof TRAMOS_ANTIGUEDAD)[number];

export const consultaAntiguedadSchema = z.object({
  /** Venta = cuentas por cobrar (clientes); compra = cuentas por pagar (proveedores) */
  operacion: operacionComercialSchema,
  /** Fecha de corte; sin ella, hoy */
  alFecha: fechaSchema.optional(),
  terceroId: idSchema.optional(),
});
export type ConsultaAntiguedad = z.infer<typeof consultaAntiguedadSchema>;

export type MontosPorTramo = Record<TramoAntiguedad, string>;

export interface DocumentoAntiguedad {
  documentoId: string;
  tipoDocumento: z.infer<typeof tipoDocumentoComercialSchema>;
  numeroDocumento: string;
  fecha: string;
  fechaVencimiento: string;
  /** Días de atraso al corte; negativo o cero si todavía no vence */
  diasVencido: number;
  tramo: TramoAntiguedad;
  saldo: string;
}

export interface FilaAntiguedad {
  tercero: { id: string; nombre: string };
  tramos: MontosPorTramo;
  total: string;
  documentos: DocumentoAntiguedad[];
}

export interface AntiguedadSaldos {
  operacion: z.infer<typeof operacionComercialSchema>;
  alFecha: string;
  filas: FilaAntiguedad[];
  totales: MontosPorTramo & { total: string };
  /** Comparación con el saldo de la cuenta de cuentas por cobrar (1103) o por pagar (2102) del mayor al corte */
  cuadre: {
    cuenta: string;
    saldoMayor: string;
    saldoReporte: string;
    diferencia: string;
    cuadra: boolean;
  };
}
