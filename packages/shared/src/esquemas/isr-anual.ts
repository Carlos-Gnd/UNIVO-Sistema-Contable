import { z } from "zod";
import { Dinero } from "../dinero/dinero";
import { montoSchema } from "./comunes";
import { tipoContribuyenteSchema } from "./enums";

const anioSchema = z.int().min(2000).max(2100);

const montoIsrRequeridoSchema = z
  .union([z.string(), z.number()])
  .refine((valor) => typeof valor !== "string" || valor.trim() !== "", {
    error: "Este valor es obligatorio.",
  })
  .pipe(montoSchema);

const porcentajeIsrSchema = montoIsrRequeridoSchema.refine((valor) => !Dinero.de(valor).mayorQue("100.00"), {
  error: "El porcentaje no puede superar 100.00.",
});

export const tramoIsrSchema = z
  .object({
    desde: montoIsrRequeridoSchema,
    hasta: montoIsrRequeridoSchema.nullable(),
    porcentaje: porcentajeIsrSchema,
    cuotaFija: montoIsrRequeridoSchema,
  })
  .strict();
export type TramoIsr = z.infer<typeof tramoIsrSchema>;

const tramosIsrSchema = z
  .array(tramoIsrSchema)
  .min(1)
  .max(20)
  .superRefine((tramos, ctx) => {
    if (tramos.length === 0) return;
    if (!Dinero.de(tramos[0]!.desde).esCero()) {
      ctx.addIssue({ code: "custom", path: [0, "desde"], message: "El primer tramo debe comenzar en cero." });
    }
    for (const [indice, tramo] of tramos.entries()) {
      if (tramo.hasta !== null && !Dinero.de(tramo.hasta).mayorQue(tramo.desde)) {
        ctx.addIssue({
          code: "custom",
          path: [indice, "hasta"],
          message: "El límite superior debe ser mayor al límite inferior.",
        });
      }
      if (indice > 0 && !Dinero.de(tramo.desde).igualA(tramos[indice - 1]!.hasta ?? "-1")) {
        ctx.addIssue({
          code: "custom",
          path: [indice, "desde"],
          message: "Los tramos deben ser consecutivos y sin traslapes.",
        });
      }
      if (indice < tramos.length - 1 && tramo.hasta === null) {
        ctx.addIssue({
          code: "custom",
          path: [indice, "hasta"],
          message: "Solo el último tramo puede quedar abierto.",
        });
      }
      if (indice === tramos.length - 1 && tramo.hasta !== null) {
        ctx.addIssue({
          code: "custom",
          path: [indice, "hasta"],
          message: "El último tramo debe quedar abierto.",
        });
      }
    }
  });

export const crearConfiguracionIsrNaturalSchema = z
  .object({
    anio: anioSchema,
    tipoContribuyente: z.literal("persona_natural"),
    tramos: tramosIsrSchema,
  })
  .strict();

export const crearConfiguracionIsrSociedadSchema = z
  .object({
    anio: anioSchema,
    tipoContribuyente: z.literal("sociedad"),
    tasaSociedad: porcentajeIsrSchema,
  })
  .strict();

export const crearConfiguracionIsrSchema = z.discriminatedUnion("tipoContribuyente", [
  crearConfiguracionIsrNaturalSchema,
  crearConfiguracionIsrSociedadSchema,
]);
export type CrearConfiguracionIsr = z.infer<typeof crearConfiguracionIsrSchema>;

export interface ConfiguracionIsrVista {
  id: string;
  anio: number;
  version: number;
  tipoContribuyente: z.infer<typeof tipoContribuyenteSchema>;
  tasaSociedad: string | null;
  tramos: TramoIsr[];
  creadoEn: string;
}

export interface DetalleIsrAnual {
  utilidadAntesImpuesto: string;
  baseImponible: string;
  impuestoDeterminado: string;
  pagosACuenta: string;
  pagosAplicados: string;
  impuestoPendiente: string;
  saldoAFavor: string;
  utilidadDespuesDeImpuesto: string;
  capitalSocial: string;
  reservaLegalActual: string;
  limiteReservaLegal: string;
  reservaLegalDisponible: string;
  reservaLegalAProvisionar: string;
  tramoAplicado: TramoIsr | null;
  tasaAplicada: string | null;
}

export interface PeriodoCierreAnualVista {
  id: string;
  mes: number;
  estado: "abierto" | "cerrado";
}

export interface LineaPartidaAnualVista {
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
}

export interface PartidaAnualVista {
  id: string;
  estado: "borrador" | "contabilizada";
  fecha: string;
  lineas: LineaPartidaAnualVista[];
}

export interface EjercicioSiguienteVista {
  id: string;
  anio: number;
  periodoInicialId: string;
  fechaInicio: string;
  estado: "abierto" | "cerrado";
}

export interface EstadoCierreAnual {
  ejercicioId: string;
  anio: number;
  tipoContribuyente: z.infer<typeof tipoContribuyenteSchema>;
  periodos: PeriodoCierreAnualVista[];
  validaciones: {
    sinBorradores: { ok: boolean; cantidad: number };
    periodosListos: { ok: boolean; cerrados: number; total: 12; mesesAbiertos: number[] };
    partidasCuadradas: { ok: boolean; cantidad: number };
    balanza: { ok: boolean; debe: string; haber: string; diferencia: string };
  };
  listoParaIsr: boolean;
  permisoGenerar: boolean;
  permisoCerrar: boolean;
  permisoReabrir: boolean;
  todasSucursales: boolean;
  ejercicioCerrado: boolean;
  ejercicioSiguiente: EjercicioSiguienteVista | null;
  configuracionIsr: ConfiguracionIsrVista | null;
  detalleIsr: DetalleIsrAnual | null;
  partidaIsr: { id: string; estado: "borrador" | "contabilizada"; fecha: string } | null;
  vistaCierre: { utilidadNeta: string; lineas: LineaPartidaAnualVista[] } | null;
  partidaCierre: PartidaAnualVista | null;
  vistaReapertura: { lineas: LineaPartidaAnualVista[] } | null;
  partidaReapertura: PartidaAnualVista | null;
}

export interface ResultadoProvisionIsr {
  detalle: DetalleIsrAnual;
  partida: { id: string; estado: "borrador" | "contabilizada"; fecha: string } | null;
}
