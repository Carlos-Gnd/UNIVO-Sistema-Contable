import { z } from "zod";
import { idSchema } from "./comunes";

/** Crea un respaldo completo o limitado a una sucursal. */
export const crearRespaldoSchema = z.object({ sucursalId: idSchema.optional() });
export type CrearRespaldo = z.infer<typeof crearRespaldoSchema>;

/** Confirmación explícita requerida antes de restaurar en una empresa vacía. */
export const restaurarRespaldoSchema = z.object({ confirmacion: z.literal("RESTAURAR") });
export type RestaurarRespaldo = z.infer<typeof restaurarRespaldoSchema>;

export interface RespaldoVista {
  id: string;
  tipo: "empresa" | "sucursal";
  sucursalId: string | null;
  sucursal: string | null;
  nombreArchivo: string;
  sha256: string;
  creadoEn: string;
}

export interface ResultadoRestauracionRespaldo {
  tablasRestauradas: number;
  filasRestauradas: number;
}
