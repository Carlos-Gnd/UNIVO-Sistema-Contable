import { z } from "zod";
import { fechaSchema, idSchema, montoSchema, textoOpcionalSchema } from "./comunes";
import { operacionComercialSchema, tipoDocumentoComercialSchema, type CondicionPago } from "./comercial";

// ───────────── Abonos de cuentas por cobrar y por pagar (HU-62) ─────────────

/** Parte de un abono que se aplica a un documento al crédito. */
export const aplicacionAbonoSchema = z.object({
  documentoId: idSchema,
  monto: montoSchema.refine((m) => Number(m) > 0, { error: "El monto debe ser mayor que cero." }),
});
export type AplicacionAbono = z.infer<typeof aplicacionAbonoSchema>;

/**
 * Abono: un cobro a un cliente (operación venta) o un pago a un proveedor (operación compra) que se reparte entre uno o
 * varios documentos al crédito del mismo cliente o proveedor. El monto total es la suma de lo aplicado.
 */
export const crearAbonoSchema = z
  .object({
    operacion: operacionComercialSchema,
    sucursalId: idSchema,
    terceroId: idSchema,
    fecha: fechaSchema,
    /** Caja o banco donde entra el cobro o de donde sale el pago */
    cuentaPagoId: idSchema,
    referencia: textoOpcionalSchema(60),
    observaciones: textoOpcionalSchema(300),
    aplicaciones: z.array(aplicacionAbonoSchema).min(1, { error: "Elige al menos un documento." }).max(100),
  })
  .superRefine((a, ctx) => {
    const vistos = new Set<string>();
    a.aplicaciones.forEach((x, i) => {
      if (vistos.has(x.documentoId)) {
        ctx.addIssue({
          code: "custom",
          path: ["aplicaciones", i, "documentoId"],
          message: "El documento está repetido en el abono.",
        });
      }
      vistos.add(x.documentoId);
    });
  });
export type CrearAbono = z.infer<typeof crearAbonoSchema>;

export const consultaAbonosSchema = z.object({
  operacion: operacionComercialSchema,
  terceroId: idSchema.optional(),
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
});
export type ConsultaAbonos = z.infer<typeof consultaAbonosSchema>;

export const consultaPendientesSchema = z.object({
  operacion: operacionComercialSchema,
  terceroId: idSchema.optional(),
  /** Texto contenido en el número del documento o el nombre del tercero */
  busqueda: z.string().trim().max(100).optional(),
});
export type ConsultaPendientes = z.infer<typeof consultaPendientesSchema>;

export interface AplicacionAbonoVista {
  documentoId: string;
  tipoDocumento: z.infer<typeof tipoDocumentoComercialSchema>;
  numeroDocumento: string;
  monto: string;
}

export interface AbonoVista {
  id: string;
  operacion: z.infer<typeof operacionComercialSchema>;
  sucursalId: string;
  tercero: { id: string; nombre: string; nit: string };
  fecha: string;
  referencia: string | null;
  cuentaPagoId: string;
  monto: string;
  partidaId: string;
  estadoPartida: "borrador" | "contabilizada" | "anulada";
  observaciones: string | null;
  aplicaciones: AplicacionAbonoVista[];
}

export type AbonoResumen = Omit<AbonoVista, "aplicaciones">;

/** Documento al crédito con saldo por cobrar o por pagar. */
export interface DocumentoPendiente {
  id: string;
  operacion: z.infer<typeof operacionComercialSchema>;
  tipoDocumento: z.infer<typeof tipoDocumentoComercialSchema>;
  numeroDocumento: string;
  fecha: string;
  fechaVencimiento: string;
  sucursalId: string;
  tercero: { id: string; nombre: string };
  condicionPago: CondicionPago;
  /** Total neto del documento: lo que se debía o se cobraba al registrarlo */
  totalNeto: string;
  /** Notas de crédito menos notas de débito (lo que corrigieron el documento) */
  ajustes: string;
  /** Lo abonado hasta hoy (cobros o pagos) */
  abonado: string;
  /** Lo que falta por cobrar o por pagar */
  saldo: string;
  estadoPartida: "borrador" | "contabilizada";
}
