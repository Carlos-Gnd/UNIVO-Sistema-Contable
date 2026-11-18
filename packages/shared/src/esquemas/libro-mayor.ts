import { z } from "zod";
import { fechaSchema, idSchema } from "./comunes";
import { tipoPartidaSchema, type Naturaleza, type TipoPartida } from "./enums";

/** Filtros del libro mayor; sin fechas se consulta todo el historial de la cuenta. */
export const consultaLibroMayorSchema = z
  .object({
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
    tipo: tipoPartidaSchema.optional(),
    sucursalId: idSchema.optional(),
  })
  .refine((c) => !c.desde || !c.hasta || c.desde <= c.hasta, {
    error: "La fecha inicial no puede ser posterior a la final.",
    path: ["desde"],
  });
export type ConsultaLibroMayor = z.infer<typeof consultaLibroMayorSchema>;

export interface MovimientoLibroMayor {
  fecha: string;
  partidaId: string;
  numero: number;
  tipo: TipoPartida;
  concepto: string | null;
  sucursalId: string;
  sucursal: string;
  debe: string;
  haber: string;
  saldo: string;
}

export interface LibroMayor {
  cuentaId: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  desde: string | null;
  hasta: string | null;
  saldoInicial: string;
  movimientos: MovimientoLibroMayor[];
  totalDebe: string;
  totalHaber: string;
  saldoFinal: string;
}
