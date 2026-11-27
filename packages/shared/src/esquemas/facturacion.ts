import { z } from "zod";
import { fechaSchema, idSchema, opcional, textoOpcionalSchema } from "./comunes";
import { condicionPagoSchema, lineaDocumentoSchema } from "./comercial";

// ───────────── Facturación electrónica: DTE (HU-53 a HU-57) ─────────────

/** Tipos de DTE (CAT-002): 01 factura, 03 comprobante de crédito fiscal, 05 nota de crédito, 06 nota de débito. */
export const TIPOS_DTE = ["01", "03", "05", "06"] as const;
export const tipoDteSchema = z.enum(TIPOS_DTE);
export type TipoDte = z.infer<typeof tipoDteSchema>;

export const ESTADOS_DTE = ["procesado", "invalidado"] as const;
export const estadoDteSchema = z.enum(ESTADOS_DTE);
export type EstadoDte = z.infer<typeof estadoDteSchema>;

/**
 * Emitir una factura (01) o un CCF (03): son los datos de la venta sin número ni fecha. El número del documento es
 * el número de control del DTE y la fecha es la de emisión; la venta y su partida se registran en la misma operación.
 */
export const emitirVentaDteSchema = z
  .object({
    tipoDocumento: z.enum(["factura", "ccf"]),
    sucursalId: idSchema,
    terceroId: opcional(idSchema),
    condicionPago: condicionPagoSchema,
    cuentaPagoId: opcional(idSchema),
    diasCredito: opcional(z.coerce.number().int().min(0).max(365)),
    observaciones: textoOpcionalSchema(300),
    lineas: z.array(lineaDocumentoSchema).min(1, { error: "Agrega al menos una línea." }).max(200),
  })
  .superRefine((d, ctx) => {
    if (d.condicionPago === "contado" && d.cuentaPagoId === undefined) {
      ctx.addIssue({ code: "custom", path: ["cuentaPagoId"], message: "Elige la caja o el banco del pago." });
    }
    if (d.tipoDocumento === "ccf" && d.terceroId === undefined) {
      ctx.addIssue({ code: "custom", path: ["terceroId"], message: "Un CCF necesita el cliente." });
    }
    if (d.condicionPago === "credito" && d.terceroId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["terceroId"],
        message: "Una venta al crédito necesita el cliente.",
      });
    }
  });
export type EmitirVentaDte = z.infer<typeof emitirVentaDteSchema>;

export const consultaDteSchema = z.object({
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  tipo: tipoDteSchema.optional(),
  estado: estadoDteSchema.optional(),
  /** Número de control, código de generación o cliente */
  busqueda: z.string().trim().max(100).optional(),
});
export type ConsultaDte = z.infer<typeof consultaDteSchema>;

export interface DteResumen {
  id: string;
  tipoDte: TipoDte;
  /** «Factura», «Comprobante de crédito fiscal»… */
  nombreTipo: string;
  numeroControl: string;
  codigoGeneracion: string;
  fechaEmision: string;
  horaEmision: string;
  sucursalId: string;
  /** Cliente; null en una factura a consumidor final */
  receptor: string | null;
  total: string;
  iva: string;
  estado: EstadoDte;
  selloRecepcion: string;
  /** Venta que documenta (factura o CCF) */
  documentoId: string | null;
  /** Nota comercial que documenta (notas de crédito y débito) */
  notaId: string | null;
  /** CCF que corrige la nota */
  relacionado: { id: string; numeroControl: string; codigoGeneracion: string } | null;
  invalidacion: { tipo: number; motivo: string; invalidadoEn: string; selloRecepcion: string } | null;
}

export interface DteVista extends DteResumen {
  /** JSON del DTE como se firmó */
  documento: Record<string, unknown>;
  /** Firma JWS (RS512) del JSON */
  firma: string;
  /** Respuesta simulada de la recepción de Hacienda */
  respuesta: Record<string, unknown>;
  evento: Record<string, unknown> | null;
}
