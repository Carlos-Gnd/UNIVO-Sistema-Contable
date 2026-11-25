import { z } from "zod";
import { fechaSchema, idSchema, textoSchema } from "./comunes";

/** Crea una plantilla recurrente a partir de una partida existente (HU-26). */
export const crearPlantillaRecurrenteSchema = z.object({
  partidaId: idSchema,
  nombre: textoSchema(120),
});
export type CrearPlantillaRecurrente = z.infer<typeof crearPlantillaRecurrenteSchema>;

export const editarPlantillaRecurrenteSchema = z
  .object({ nombre: textoSchema(120).optional(), activa: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { error: "Indique al menos un cambio." });
export type EditarPlantillaRecurrente = z.infer<typeof editarPlantillaRecurrenteSchema>;

/** Fecha de la partida del mes que se genera en borrador desde la plantilla. */
export const generarPartidaRecurrenteSchema = z.object({ fecha: fechaSchema });
export type GenerarPartidaRecurrente = z.infer<typeof generarPartidaRecurrenteSchema>;

export interface LineaPlantillaRecurrenteVista {
  cuentaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  debe: string;
  haber: string;
}

export interface PlantillaRecurrenteVista {
  id: string;
  nombre: string;
  concepto: string | null;
  tipo: string;
  sucursalId: string;
  sucursalNombre: string;
  activa: boolean;
  lineas: LineaPlantillaRecurrenteVista[];
  /** Última partida generada que sigue vigente (no anulada), o null. */
  ultimaGeneracion: { partidaId: string; fecha: string; estado: string } | null;
}

export interface PartidaGeneradaVista {
  partidaId: string;
  fecha: string;
  estado: string;
}

/** Partida existente que puede usarse como modelo de una plantilla. */
export interface PartidaDisponibleVista {
  id: string;
  fecha: string;
  numero: number | null;
  concepto: string | null;
  estado: string;
  total: string;
}

/** Resultado de generar el borrador del mes de todas las plantillas activas. */
export interface ResultadoGenerarMesVista {
  generadas: { plantillaId: string; nombre: string; partidaId: string }[];
  omitidas: { plantillaId: string; nombre: string; motivo: string }[];
}
