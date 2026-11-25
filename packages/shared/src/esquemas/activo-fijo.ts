import { z } from "zod";
import {
  CATEGORIAS_ACTIVO,
  tasaAnual,
  vidaMinimaAnios,
  type CategoriaActivo,
} from "../contabilidad/depreciacion";
import { Dinero } from "../dinero/dinero";
import { fechaSchema, idSchema, montoSchema, opcional, textoSchema } from "./comunes";

export const categoriaActivoSchema = z.enum(CATEGORIAS_ACTIVO, { error: "Categoría de activo inválida." });

/**
 * Registro de un activo fijo (HU-81). Las cuentas son opcionales: sin ellas la API usa las del catálogo base según
 * la categoría. Con `contrapartidaId` (caja, bancos o proveedores) se genera y contabiliza la partida de adquisición;
 * sin ella el activo ya está en los saldos iniciales y solo se registra para depreciarlo.
 */
export const crearActivoFijoSchema = z
  .object({
    nombre: textoSchema(200),
    categoria: categoriaActivoSchema,
    sucursalId: idSchema,
    costo: montoSchema,
    valorResidual: montoSchema.default("0.00"),
    fechaAdquisicion: fechaSchema,
    vidaUtilAnios: z.int({ error: "La vida útil debe ser un número entero de años." }).min(1).max(100),
    cuentaActivoId: opcional(idSchema),
    cuentaDepreciacionId: opcional(idSchema),
    cuentaGastoId: opcional(idSchema),
    contrapartidaId: opcional(idSchema),
  })
  .superRefine((a, ctx) => {
    const costo = Dinero.de(a.costo);
    if (!costo.mayorQue(0))
      ctx.addIssue({ code: "custom", path: ["costo"], message: "El costo debe ser mayor que cero." });
    if (!costo.mayorQue(a.valorResidual)) {
      ctx.addIssue({
        code: "custom",
        path: ["valorResidual"],
        message: "El valor residual debe ser menor al costo.",
      });
    }
    const minima = vidaMinimaAnios(a.categoria);
    if (a.vidaUtilAnios < minima) {
      ctx.addIssue({
        code: "custom",
        path: ["vidaUtilAnios"],
        message: `La vida útil mínima de esta categoría es ${minima} años (porcentaje máximo fiscal ${tasaAnual(minima)} %).`,
      });
    }
  });
export type CrearActivoFijo = z.infer<typeof crearActivoFijoSchema>;
export type CrearActivoFijoEntrada = z.input<typeof crearActivoFijoSchema>;

/** Baja de un activo: la fecha y, si no se indica, la cuenta de pérdida del catálogo base (4301). */
export const darBajaActivoSchema = z.object({
  fecha: fechaSchema,
  cuentaPerdidaId: opcional(idSchema),
});
export type DarBajaActivo = z.infer<typeof darBajaActivoSchema>;

export type EstadoActivoFijo = "activo" | "de_baja";

/** Activo fijo como lo expone la API; los montos son texto con dos decimales y las fechas AAAA-MM-DD. */
export interface ActivoFijoVista {
  id: string;
  codigo: string;
  nombre: string;
  categoria: CategoriaActivo;
  sucursalId: string;
  sucursalNombre: string;
  costo: string;
  valorResidual: string;
  fechaAdquisicion: string;
  vidaUtilAnios: number;
  /** Porcentaje anual en línea recta (100 / vida útil) */
  tasaAnual: string;
  depreciacionAcumulada: string;
  valorEnLibros: string;
  estado: EstadoActivoFijo;
  /** Primer día del último mes depreciado (AAAA-MM-01); nulo si aún no se deprecia */
  ultimoMesDepreciado: string | null;
  fechaBaja: string | null;
  cuentaActivo: { id: string; codigo: string; nombre: string };
  cuentaDepreciacion: { id: string; codigo: string; nombre: string };
  cuentaGasto: { id: string; codigo: string; nombre: string };
  partidaAltaId: string | null;
  partidaBajaId: string | null;
}

/** Partida que generó una operación del activo (alta, baja o depreciación), ya contabilizada. */
export interface PartidaGenerada {
  id: string;
  numero: number;
  ambito: string;
}

export interface ResultadoAltaActivo {
  activo: ActivoFijoVista;
  /** Nula si el activo se registró sin contrapartida */
  partida: PartidaGenerada | null;
}

export interface ResultadoBajaActivo {
  activo: ActivoFijoVista;
  partida: PartidaGenerada;
}
