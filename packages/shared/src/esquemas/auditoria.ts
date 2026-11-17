import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";

/**
 * Módulos de la bitácora (HU-11) y las tablas de la base que agrupa cada uno.
 * Al agregar una tabla con trigger de bitácora, hay que sumarla aquí.
 */
export const MODULOS_BITACORA = {
  organizacion: { nombre: "Empresas y sucursales", tablas: ["empresas", "sucursales"] },
  usuarios: { nombre: "Usuarios y permisos", tablas: ["membresias", "membresia_sucursales"] },
  catalogo: { nombre: "Catálogo de cuentas", tablas: ["cuentas"] },
  contabilidad: {
    nombre: "Partidas y períodos",
    tablas: ["ejercicios", "periodos", "partidas", "partida_detalles"],
  },
} as const;

export type ModuloBitacora = keyof typeof MODULOS_BITACORA;
export const moduloBitacoraSchema = z.enum(
  Object.keys(MODULOS_BITACORA) as [ModuloBitacora, ...ModuloBitacora[]],
  { error: "Módulo inválido." },
);

/** Módulo al que pertenece una tabla, o null si la tabla no está en ninguno. */
export function moduloDeTabla(tabla: string): ModuloBitacora | null {
  for (const [modulo, { tablas }] of Object.entries(MODULOS_BITACORA)) {
    if ((tablas as readonly string[]).includes(tabla)) return modulo as ModuloBitacora;
  }
  return null;
}

export const accionBitacoraSchema = z.enum(["INSERT", "UPDATE", "DELETE"], { error: "Acción inválida." });
export type AccionBitacora = z.infer<typeof accionBitacoraSchema>;

/** Nombre de cada acción para mostrar en la interfaz. */
export const NOMBRE_ACCION_BITACORA: Record<AccionBitacora, string> = {
  INSERT: "Creación",
  UPDATE: "Modificación",
  DELETE: "Eliminación",
};

export const POR_PAGINA_BITACORA = { inicial: 25, maximo: 100 } as const;

/**
 * Filtros de la consulta de bitácora (query string). Las fechas son días calendario de El Salvador
 * (AAAA-MM-DD) e incluyen el día completo de «hasta».
 */
export const filtrosBitacoraSchema = z
  .object({
    usuarioId: idSchema.optional(),
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
    modulo: moduloBitacoraSchema.optional(),
    accion: accionBitacoraSchema.optional(),
    pagina: z.coerce.number({ error: "Página inválida." }).int().min(1).default(1),
    porPagina: z.coerce
      .number({ error: "Cantidad por página inválida." })
      .int()
      .min(1)
      .max(POR_PAGINA_BITACORA.maximo, { error: `Máximo ${POR_PAGINA_BITACORA.maximo} por página.` })
      .default(POR_PAGINA_BITACORA.inicial),
  })
  .strict()
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    error: "La fecha inicial no puede ser posterior a la final.",
    path: ["hasta"],
  });
export type FiltrosBitacora = z.infer<typeof filtrosBitacoraSchema>;
export type FiltrosBitacoraEntrada = z.input<typeof filtrosBitacoraSchema>;

/** Un cambio registrado en la bitácora, tal como lo devuelve la API. */
export interface EntradaBitacora {
  /** Texto: el id es BIGINT en la base */
  id: string;
  /** Fecha y hora ISO 8601 */
  fecha: string;
  /** Quién hizo el cambio; null si se hizo fuera de la API (por ejemplo, una migración) */
  usuario: { id: string; nombre: string; correo: string } | null;
  modulo: ModuloBitacora | null;
  tabla: string;
  accion: AccionBitacora;
  registroId: string | null;
  datosAnteriores: Record<string, unknown> | null;
  datosNuevos: Record<string, unknown> | null;
}

export interface PaginaBitacora {
  registros: EntradaBitacora[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}
