import { z } from "zod";
import { fechaSchema, idSchema, montoSchema, textoOpcionalSchema, textoSchema } from "./comunes";
import { naturalezaSchema, tipoCuentaSchema, tipoPartidaSchema } from "./enums";

/** Longitudes de código válidas en el catálogo: rubro, cuenta, subcuenta y niveles auxiliares. */
export const LONGITUDES_CODIGO = [1, 2, 4, 6, 8, 10] as const;

export const codigoCuentaSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, { error: "El código solo lleva dígitos." })
  .refine((c) => (LONGITUDES_CODIGO as readonly number[]).includes(c.length), {
    error: "El código debe tener 1, 2, 4, 6, 8 o 10 dígitos.",
  });

/** El nivel y la cuenta padre los calcula la base de datos a partir del código. */
export const crearCuentaSchema = z.object({
  codigo: codigoCuentaSchema,
  nombre: textoSchema(200),
  naturaleza: naturalezaSchema,
  tipo: tipoCuentaSchema,
  activa: z.boolean().default(true),
});
export type CrearCuenta = z.infer<typeof crearCuentaSchema>;
export type CrearCuentaEntrada = z.input<typeof crearCuentaSchema>;

/** Campos que se pueden editar en una cuenta existente; su estado se cambia por la operación de inactivar. */
export const editarCuentaSchema = z
  .object({
    codigo: codigoCuentaSchema,
    nombre: textoSchema(200),
    naturaleza: naturalezaSchema,
    tipo: tipoCuentaSchema,
  })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, { error: "Indique al menos un campo para actualizar." });
export type EditarCuenta = z.infer<typeof editarCuentaSchema>;

export const crearEjercicioSchema = z
  .object({
    anio: z.int().min(2000).max(2100),
    fechaInicio: fechaSchema,
    fechaFin: fechaSchema,
  })
  .refine((e) => e.fechaFin > e.fechaInicio, {
    error: "La fecha final debe ser posterior a la inicial.",
    path: ["fechaFin"],
  });
export type CrearEjercicio = z.infer<typeof crearEjercicioSchema>;

/**
 * Forma de una línea de partida. Las reglas que dependen del catálogo (cuenta activa, de último nivel)
 * y el cuadre se validan con validarPartida, que devuelve un error por línea para la interfaz.
 */
export const lineaPartidaSchema = z.object({
  cuentaId: idSchema,
  debe: montoSchema.default("0.00"),
  haber: montoSchema.default("0.00"),
  concepto: textoOpcionalSchema(500),
});
export type LineaPartidaEntrada = z.input<typeof lineaPartidaSchema>;

/**
 * Partida manual. Se guarda como borrador; el número correlativo se asigna al contabilizar.
 * Concepto y documento de soporte son opcionales (levantamiento, pregunta 22; HU-20).
 */
export const crearPartidaSchema = z.object({
  sucursalId: idSchema,
  fecha: fechaSchema,
  tipo: tipoPartidaSchema.default("operacion"),
  concepto: textoOpcionalSchema(1000),
  documentoTipo: textoOpcionalSchema(30),
  documentoNumero: textoOpcionalSchema(60),
  lineas: z.array(lineaPartidaSchema).min(1, { error: "La partida necesita al menos una línea." }),
});
export type CrearPartida = z.infer<typeof crearPartidaSchema>;
export type CrearPartidaEntrada = z.input<typeof crearPartidaSchema>;

/** Una partida contabilizada solo se anula con su reversión, indicando el motivo. */
export const anularPartidaSchema = z.object({
  motivo: textoSchema(500),
});
export type AnularPartida = z.infer<typeof anularPartidaSchema>;

/** Máximo de partidas que se contabilizan en una sola operación desde la bandeja (HU-22). */
export const MAXIMO_LOTE_CONTABILIZACION = 100;

/** Contabilización por lote: las partidas reciben su número en orden de fecha. */
export const contabilizarLoteSchema = z.object({
  ids: z
    .array(idSchema)
    .min(1, { error: "Seleccione al menos una partida." })
    .max(MAXIMO_LOTE_CONTABILIZACION, {
      error: `Se contabilizan como máximo ${MAXIMO_LOTE_CONTABILIZACION} partidas a la vez.`,
    })
    .transform((ids) => [...new Set(ids)]),
});
export type ContabilizarLote = z.infer<typeof contabilizarLoteSchema>;

/** Por qué una partida no se contabilizó. */
export type MotivoRechazo =
  "no_encontrada" | "no_es_borrador" | "sucursal_no_autorizada" | "no_cuadra" | "regla_contable";

export interface PartidaContabilizada {
  id: string;
  numero: number;
  /** Ámbito del correlativo: año, año-mes o año-tipo según la empresa */
  ambito: string;
}

export interface PartidaRechazada {
  id: string;
  motivo: MotivoRechazo;
  mensaje: string;
}

/** Respuesta de la API al contabilizar: las que recibieron número y las que se quedan en la bandeja. */
export interface ResultadoContabilizacion {
  contabilizadas: PartidaContabilizada[];
  rechazadas: PartidaRechazada[];
}
