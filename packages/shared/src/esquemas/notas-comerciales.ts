import { z } from "zod";
import { fechaSchema, idSchema, montoSchema, opcional, textoOpcionalSchema, textoSchema } from "./comunes";
import { cantidadSchema, numeroSerieSchema } from "./inventario";
import { claseGravamenSchema, operacionComercialSchema, type DocumentoComercialVista } from "./comercial";

// ───────────── Devoluciones y rebajas: notas de crédito y de débito (HU-61) ─────────────

export const TIPOS_NOTA = ["credito", "debito"] as const;
export const tipoNotaSchema = z.enum(TIPOS_NOTA);
export type TipoNota = z.infer<typeof tipoNotaSchema>;
export const MOTIVOS_NOTA = ["devolucion", "rebaja", "cargo"] as const;
export const motivoNotaSchema = z.enum(MOTIVOS_NOTA);
export type MotivoNota = z.infer<typeof motivoNotaSchema>;

/**
 * Una línea de la nota. En una devolución se indica la línea del documento y las unidades que regresan; en una rebaja,
 * la línea y el importe que se rebaja (con la convención del documento: sin IVA en un CCF); en un cargo adicional
 * (nota de débito), la cuenta contable que se carga y su importe.
 */
export const lineaNotaSchema = z.object({
  /** Posición de la línea del documento original (devolución y rebaja) */
  lineaOrden: z.coerce.number().int().min(1).max(200).optional(),
  cantidad: cantidadSchema.optional(),
  monto: montoSchema.optional(),
  cuentaId: opcional(idSchema),
  descripcion: textoOpcionalSchema(200),
  clase: claseGravamenSchema.default("gravada"),
  /** Series o IMEI de las unidades que regresan; solo para productos controlados por serie */
  series: z.array(numeroSerieSchema).optional(),
});
export type LineaNota = z.infer<typeof lineaNotaSchema>;

export const crearNotaSchema = z
  .object({
    documentoId: idSchema,
    tipo: tipoNotaSchema,
    motivo: motivoNotaSchema,
    numeroNota: textoSchema(60),
    fecha: fechaSchema,
    /** Caja o banco del reembolso o cobro; obligatoria solo si el documento fue al contado */
    cuentaPagoId: opcional(idSchema),
    observaciones: textoOpcionalSchema(300),
    lineas: z.array(lineaNotaSchema).min(1, { error: "Agrega al menos una línea." }).max(200),
  })
  .superRefine((n, ctx) => {
    const coherente = n.tipo === "credito" ? n.motivo !== "cargo" : n.motivo === "cargo";
    if (!coherente) {
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message:
          n.tipo === "credito"
            ? "Una nota de crédito es una devolución o una rebaja."
            : "Una nota de débito es un cargo adicional.",
      });
      return;
    }
    n.lineas.forEach((l, i) => {
      const falta = (campo: string, mensaje: string) =>
        ctx.addIssue({ code: "custom", path: ["lineas", i, campo], message: mensaje });
      if (n.motivo === "devolucion") {
        if (l.lineaOrden === undefined) falta("lineaOrden", "Elige la línea del documento.");
        if (l.cantidad === undefined || Number(l.cantidad) <= 0)
          falta("cantidad", "Indica las unidades que regresan.");
      } else if (n.motivo === "rebaja") {
        if (l.lineaOrden === undefined) falta("lineaOrden", "Elige la línea del documento.");
        if (l.monto === undefined || Number(l.monto) <= 0) falta("monto", "Indica el importe de la rebaja.");
      } else {
        if (l.cuentaId === undefined) falta("cuentaId", "Elige la cuenta del cargo.");
        if (l.monto === undefined || Number(l.monto) <= 0) falta("monto", "Indica el importe del cargo.");
      }
    });
  });
export type CrearNota = z.infer<typeof crearNotaSchema>;

export const consultaNotasSchema = z.object({
  operacion: operacionComercialSchema,
  desde: fechaSchema.optional(),
  hasta: fechaSchema.optional(),
  documentoId: idSchema.optional(),
  /** Texto contenido en el número de la nota o el nombre del tercero */
  busqueda: z.string().trim().max(100).optional(),
});
export type ConsultaNotas = z.infer<typeof consultaNotasSchema>;

export interface LineaNotaVista {
  orden: number;
  productoId: string | null;
  productoCodigo: string | null;
  cuentaId: string | null;
  descripcion: string;
  clase: z.infer<typeof claseGravamenSchema>;
  cantidad: string;
  precioUnitario: string;
  monto: string;
  /** Costo que movió el kardex en una devolución */
  costoKardex: string | null;
}

export interface NotaComercialVista {
  id: string;
  operacion: z.infer<typeof operacionComercialSchema>;
  tipo: TipoNota;
  motivo: MotivoNota;
  numeroNota: string;
  fecha: string;
  documento: {
    id: string;
    tipoDocumento: DocumentoComercialVista["tipoDocumento"];
    numeroDocumento: string;
  };
  tercero: { id: string; nombre: string; nit: string; nrc: string | null } | null;
  cuentaPagoId: string | null;
  totalGravado: string;
  totalExento: string;
  totalNoSujeto: string;
  iva: string;
  ivaPercibido: string;
  ivaRetenido: string;
  total: string;
  totalNeto: string;
  partidaId: string;
  estadoPartida: "borrador" | "contabilizada" | "anulada";
  /** Partida que regresa el costo a inventarios (devolución de una venta con inventario perpetuo) */
  partidaCostoId: string | null;
  observaciones: string | null;
  lineas: LineaNotaVista[];
}

export type NotaComercialResumen = Omit<NotaComercialVista, "lineas">;

/** Lo que todavía se puede devolver o rebajar de cada línea de un documento. */
export interface LineaDisponibleNota {
  orden: number;
  productoId: string | null;
  productoCodigo: string | null;
  descripcion: string;
  clase: z.infer<typeof claseGravamenSchema>;
  cantidad: string;
  precioUnitario: string;
  monto: string;
  cantidadDisponible: string;
  montoDisponible: string;
}

export interface DisponibleNota {
  documentoId: string;
  /** Lo que todavía debe o se debe del documento al crédito; "0.00" si fue al contado */
  saldo: string;
  lineas: LineaDisponibleNota[];
}
