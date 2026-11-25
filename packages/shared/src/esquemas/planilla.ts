import { z } from "zod";
import Decimal from "decimal.js";
import { Dinero } from "../dinero/dinero";
import { editable, fechaSchema, idSchema, montoSchema, opcional, textoSchema } from "./comunes";

/** Datos de identificación y puesto del empleado. */
export const crearEmpleadoSchema = z.object({
  nombres: textoSchema(100),
  apellidos: textoSchema(100),
  dui: textoSchema(20),
  nit: textoSchema(20),
  numeroIsss: textoSchema(20),
  nup: textoSchema(20),
  puesto: textoSchema(100),
  area: opcional(textoSchema(100)),
  salario: montoSchema,
  fechaIngreso: fechaSchema,
  sucursalId: idSchema,
});
export type CrearEmpleado = z.infer<typeof crearEmpleadoSchema>;

export const editarEmpleadoSchema = z
  .object({
    nombres: textoSchema(100).optional(),
    apellidos: textoSchema(100).optional(),
    dui: textoSchema(20).optional(),
    nit: textoSchema(20).optional(),
    numeroIsss: textoSchema(20).optional(),
    nup: textoSchema(20).optional(),
    puesto: textoSchema(100).optional(),
    area: editable(textoSchema(100)),
    salario: montoSchema.optional(),
    fechaIngreso: fechaSchema.optional(),
    sucursalId: idSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "No hay cambios que guardar." });
export type EditarEmpleado = z.infer<typeof editarEmpleadoSchema>;

export interface EmpleadoVista {
  id: string;
  sucursalId: string;
  sucursal: string;
  nombres: string;
  apellidos: string;
  dui: string;
  nit: string;
  numeroIsss: string;
  nup: string;
  puesto: string;
  area: string | null;
  salario: string;
  fechaIngreso: string;
  activo: boolean;
}

const porcentajePlanillaSchema = z.union([z.string(), z.number()]).transform((valor, ctx) => {
  let tasa: Dinero;
  try {
    tasa = Dinero.de(valor);
  } catch {
    ctx.addIssue({ code: "custom", message: "Porcentaje inválido." });
    return z.NEVER;
  }
  if (tasa.esNegativo() || tasa.mayorQue("100.00")) {
    ctx.addIssue({ code: "custom", message: "El porcentaje debe estar entre 0 y 100." });
    return z.NEVER;
  }
  return tasa.aTexto();
});

const tramoRetencionSchema = z.object({
  desde: montoSchema,
  hasta: montoSchema.nullable(),
  porcentaje: porcentajePlanillaSchema,
  cuotaFija: montoSchema,
});

/** Tasas y tramos marginales que se harán vigentes en una fecha. */
export const crearConfiguracionPlanillaSchema = z
  .object({
    vigenteDesde: fechaSchema,
    tasaIsssLaboral: porcentajePlanillaSchema,
    tasaIsssPatronal: porcentajePlanillaSchema,
    techoIsss: montoSchema,
    tasaAfpLaboral: porcentajePlanillaSchema,
    tasaAfpPatronal: porcentajePlanillaSchema,
    tramos: z.array(tramoRetencionSchema).min(1, "La tabla debe tener al menos un tramo.").max(20),
  })
  .superRefine((configuracion, ctx) => {
    if (configuracion.tramos.length === 0) return;
    if (!Dinero.de(configuracion.tramos[0]!.desde).esCero()) {
      ctx.addIssue({
        code: "custom",
        path: ["tramos", 0, "desde"],
        message: "El primer tramo debe comenzar en cero.",
      });
    }
    configuracion.tramos.forEach((tramo, indice) => {
      const esUltimo = indice === configuracion.tramos.length - 1;
      if (tramo.hasta === null && !esUltimo) {
        ctx.addIssue({
          code: "custom",
          path: ["tramos", indice, "hasta"],
          message: "Solo el último tramo puede quedar abierto.",
        });
      }
      if (esUltimo && tramo.hasta !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["tramos", indice, "hasta"],
          message: "El último tramo debe quedar abierto.",
        });
      }
      if (tramo.hasta !== null && !Dinero.de(tramo.hasta).mayorQue(tramo.desde)) {
        ctx.addIssue({
          code: "custom",
          path: ["tramos", indice, "hasta"],
          message: "El límite superior debe superar el inferior.",
        });
      }
      const anterior = configuracion.tramos[indice - 1];
      if (anterior && (anterior.hasta === null || !Dinero.de(tramo.desde).igualA(anterior.hasta))) {
        ctx.addIssue({
          code: "custom",
          path: ["tramos", indice, "desde"],
          message: "Los tramos deben ser continuos y sin traslapes.",
        });
      }
    });
  });
export type CrearConfiguracionPlanilla = z.infer<typeof crearConfiguracionPlanillaSchema>;

export interface TramoRetencionPlanillaVista {
  desde: string;
  hasta: string | null;
  porcentaje: string;
  cuotaFija: string;
}

export interface ConfiguracionPlanillaVista {
  id: string;
  vigenteDesde: string;
  tasaIsssLaboral: string;
  tasaIsssPatronal: string;
  techoIsss: string;
  tasaAfpLaboral: string;
  tasaAfpPatronal: string;
  tramos: TramoRetencionPlanillaVista[];
}

const cantidadPlanillaSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,2})?$/, "Use una cantidad con hasta dos decimales.")
  .transform((valor, ctx) => {
    const cantidad = new Decimal(valor);
    if (cantidad.greaterThan(300)) {
      ctx.addIssue({ code: "custom", message: "La cantidad no puede superar 300." });
      return z.NEVER;
    }
    return cantidad.toFixed(2);
  });

/** Ajustes por persona para calcular una planilla mensual. */
export const ajusteEmpleadoPlanillaSchema = z.object({
  empleadoId: idSchema,
  horasExtra: cantidadPlanillaSchema.default("0.00"),
  diasAusencia: cantidadPlanillaSchema.default("0.00"),
  otrosDescuentos: montoSchema.default("0.00"),
});

const cuentaGastoAreaSchema = z.object({
  clave: z.string().trim().min(1).max(100),
  cuentaGastoId: idSchema,
});

/** Solicitud para calcular y generar la partida en borrador. */
export const calcularPlanillaSchema = z
  .object({
    periodo: z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, "Seleccione un período válido."),
    sucursalId: idSchema,
    cuentasGastoPorArea: z.array(cuentaGastoAreaSchema).max(100).default([]),
    ajustes: z.array(ajusteEmpleadoPlanillaSchema).max(500),
  })
  .superRefine((datos, ctx) => {
    const clavesArea = new Set<string>();
    datos.cuentasGastoPorArea.forEach(({ clave }, indice) => {
      if (clavesArea.has(clave)) {
        ctx.addIssue({
          code: "custom",
          path: ["cuentasGastoPorArea", indice, "clave"],
          message: "No repita el área de gasto.",
        });
      }
      clavesArea.add(clave);
    });
    const ids = new Set<string>();
    datos.ajustes.forEach((ajuste, indice) => {
      if (ids.has(ajuste.empleadoId)) {
        ctx.addIssue({
          code: "custom",
          path: ["ajustes", indice, "empleadoId"],
          message: "No repita el mismo empleado.",
        });
      }
      ids.add(ajuste.empleadoId);
    });
  });
export type CalcularPlanilla = z.infer<typeof calcularPlanillaSchema>;

export interface EmpleadoPlanillaVista {
  empleadoId: string;
  nombres: string;
  apellidos: string;
  numeroIsss: string;
  nup: string;
  dui: string;
  puesto: string;
  area: string | null;
  salarioBase: string;
  horasExtra: string;
  pagoHorasExtra: string;
  diasAusencia: string;
  descuentoAusencia: string;
  otrosDescuentos: string;
  bruto: string;
  isssLaboral: string;
  afpLaboral: string;
  renta: string;
  isssPatronal: string;
  afpPatronal: string;
  neto: string;
}

export interface ResumenPlanillaVista {
  bruto: string;
  isssLaboral: string;
  afpLaboral: string;
  renta: string;
  otrosDescuentos: string;
  neto: string;
  isssPatronal: string;
  afpPatronal: string;
  gastoPatronal: string;
}

/** Solicitud para calcular y provisionar prestaciones a una fecha determinada. */
export const calcularPrestacionesSchema = z.object({
  fechaCalculo: fechaSchema,
  sucursalId: idSchema,
  cuentasGastoPorArea: z.array(cuentaGastoAreaSchema).max(100).default([]),
});
export type CalcularPrestaciones = z.infer<typeof calcularPrestacionesSchema>;

export interface EmpleadoPrestacionesVista {
  empleadoId: string;
  dui: string;
  puesto: string;
  area: string | null;
  fechaIngreso: string;
  salarioBase: string;
  diasServicio: number;
  aniosServicio: string;
  fechaCorteAguinaldo: string;
  diasAguinaldo: string;
  montoAguinaldo: string;
  provisionAguinaldoMensual: string;
  diasPeriodoVacacional: number;
  montoVacaciones: string;
  provisionVacacionesMensual: string;
  salarioBaseIndemnizacion: string;
  montoIndemnizacion: string;
  provisionIndemnizacionMensual: string;
}

export interface ResumenPrestacionesVista {
  montoAguinaldo: string;
  provisionAguinaldoMensual: string;
  montoVacaciones: string;
  provisionVacacionesMensual: string;
  montoIndemnizacion: string;
  provisionIndemnizacionMensual: string;
  provisionMensualTotal: string;
}

export interface ResultadoCalculoPrestacionesVista {
  fechaCalculo: string;
  periodo: string;
  sucursalId: string;
  empleados: EmpleadoPrestacionesVista[];
  resumen: ResumenPrestacionesVista;
  partida: import("./contabilidad").PartidaVista;
}

export interface ResultadoCalculoPlanillaVista {
  periodo: string;
  sucursalId: string;
  empleados: EmpleadoPlanillaVista[];
  resumen: ResumenPlanillaVista;
  partida: import("./contabilidad").PartidaVista;
}

export const tipoPlanillaOficialSchema = z.enum(["isss", "afp"]);
export type TipoPlanillaOficial = z.infer<typeof tipoPlanillaOficialSchema>;

const periodoPlanillaOficialSchema = z
  .string()
  .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, "Seleccione un período válido.");

export const consultarPlanillaOficialSchema = z.object({ periodo: periodoPlanillaOficialSchema });
export type ConsultarPlanillaOficial = z.infer<typeof consultarPlanillaOficialSchema>;

export const presentarPlanillaOficialSchema = z.object({
  periodo: periodoPlanillaOficialSchema,
  tipo: tipoPlanillaOficialSchema,
});
export type PresentarPlanillaOficial = z.infer<typeof presentarPlanillaOficialSchema>;

export interface PresentacionPlanillaOficialVista {
  tipo: TipoPlanillaOficial;
  presentadaEn: string;
  presentadaPor: string;
}

export interface EmpleadoPlanillaOficialVista {
  empleadoId: string;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  dui: string;
  numeroIsss: string;
  nup: string;
  salarioCotizable: string;
  isssLaboral: string;
  isssPatronal: string;
  afpLaboral: string;
  afpPatronal: string;
}

export interface TotalesPlanillaOficialVista {
  salarioCotizable: string;
  laboral: string;
  patronal: string;
  total: string;
}

export interface ResultadoPlanillasOficialesVista {
  periodo: string;
  empleados: EmpleadoPlanillaOficialVista[];
  totales: {
    isss: TotalesPlanillaOficialVista;
    afp: TotalesPlanillaOficialVista;
  };
  presentaciones: Partial<Record<TipoPlanillaOficial, PresentacionPlanillaOficialVista>>;
}
