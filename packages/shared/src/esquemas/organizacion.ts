import { z } from "zod";
import {
  esDuiValido,
  esNitValido,
  esNrcValido,
  formatearNit,
  formatearNrc,
} from "../identificacion/documentos";
import { textoOpcionalSchema, textoSchema } from "./comunes";
import { clasificacionContribuyenteSchema, modoNumeracionSchema, tipoContribuyenteSchema } from "./enums";

const FORMATO_NIT = /^(\d{4}-\d{6}-\d{3}-\d|\d{8}-\d)$/;

/**
 * NIT de 14 dígitos (0614-010190-101-5) o DUI homologado como NIT (01234567-8), con dígito verificador.
 * Acepta el número sin guiones y lo devuelve con formato.
 */
export const nitSchema = z
  .string()
  .trim()
  .transform(formatearNit)
  .superRefine((nit, ctx) => {
    if (!FORMATO_NIT.test(nit)) {
      ctx.addIssue({
        code: "custom",
        message: "El NIT debe tener el formato 0000-000000-000-0 o el DUI 00000000-0.",
      });
    } else if (!esNitValido(nit) && !esDuiValido(nit)) {
      ctx.addIssue({ code: "custom", message: "El dígito verificador no es válido; revise el número." });
    }
  });

/** Número de Registro de Contribuyente (IVA): dígitos, guion y dígito verificador. Acepta el número sin guion. */
export const nrcSchema = z
  .string()
  .trim()
  .transform(formatearNrc)
  .refine(esNrcValido, { error: "El NRC debe tener el formato 000000-0." });

export const crearEmpresaSchema = z
  .object({
    nombre: textoSchema(200),
    nombreComercial: textoOpcionalSchema(200),
    nit: nitSchema,
    nrc: nrcSchema.optional(),
    tipoContribuyente: tipoContribuyenteSchema,
    clasificacion: clasificacionContribuyenteSchema.default("otro"),
    actividadEconomica: textoOpcionalSchema(200),
    direccion: textoOpcionalSchema(300),
    telefono: textoOpcionalSchema(20),
    correo: z.email({ error: "Correo inválido." }).max(150).optional(),
    modoNumeracion: modoNumeracionSchema.default("anual"),
  })
  // El DUI solo sustituye al NIT de las personas naturales; una sociedad conserva su NIT de 14 dígitos.
  .refine((e) => e.tipoContribuyente === "persona_natural" || esNitValido(e.nit), {
    error: "Una sociedad se registra con su NIT de 14 dígitos, no con un DUI.",
    path: ["nit"],
  });
export type CrearEmpresa = z.infer<typeof crearEmpresaSchema>;
export type CrearEmpresaEntrada = z.input<typeof crearEmpresaSchema>;

/** Código de 4 dígitos asignado por Hacienda (establecimiento o punto de venta del DTE). */
const codigoDteSchema = z.string().regex(/^\d{4}$/, { error: "Debe tener 4 dígitos." });

export const crearSucursalSchema = z.object({
  nombre: textoSchema(150),
  codigoEstablecimiento: codigoDteSchema,
  codigoPuntoVenta: codigoDteSchema.default("0001"),
  direccion: textoOpcionalSchema(300),
  esMatriz: z.boolean().default(false),
});
export type CrearSucursal = z.infer<typeof crearSucursalSchema>;
export type CrearSucursalEntrada = z.input<typeof crearSucursalSchema>;
