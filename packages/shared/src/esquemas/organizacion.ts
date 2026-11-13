import { z } from "zod";
import {
  esDuiValido,
  esNitValido,
  esNrcValido,
  formatearNit,
  formatearNrc,
} from "../identificacion/documentos";
import { editable, opcional, textoOpcionalSchema, textoSchema } from "./comunes";
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

const correoSchema = z.email({ error: "Correo inválido." }).max(150, { error: "Máximo 150 caracteres." });
const textoCorto = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, { error: `Máximo ${maximo} caracteres.` });

export const MENSAJE_SOCIEDAD_CON_DUI = "Una sociedad se registra con su NIT de 14 dígitos, no con un DUI.";

/** El DUI solo sustituye al NIT de las personas naturales; una sociedad conserva su NIT de 14 dígitos. */
export const nitAdmitidoPara = (tipo: z.infer<typeof tipoContribuyenteSchema>, nit: string) =>
  tipo === "persona_natural" || esNitValido(nit);

export const crearEmpresaSchema = z
  .object({
    nombre: textoSchema(200),
    nombreComercial: textoOpcionalSchema(200),
    nit: nitSchema,
    nrc: opcional(nrcSchema),
    tipoContribuyente: tipoContribuyenteSchema,
    clasificacion: clasificacionContribuyenteSchema.default("otro"),
    actividadEconomica: textoOpcionalSchema(200),
    direccion: textoOpcionalSchema(300),
    telefono: textoOpcionalSchema(20),
    correo: opcional(correoSchema),
    modoNumeracion: modoNumeracionSchema.default("anual"),
  })
  .refine((e) => nitAdmitidoPara(e.tipoContribuyente, e.nit), {
    error: MENSAJE_SOCIEDAD_CON_DUI,
    path: ["nit"],
  });
export type CrearEmpresa = z.infer<typeof crearEmpresaSchema>;
export type CrearEmpresaEntrada = z.input<typeof crearEmpresaSchema>;

/**
 * Edición parcial de una empresa (PATCH): solo se cambian los campos enviados; null o "" borran un dato
 * opcional. El tipo de contribuyente no se edita porque define el catálogo de cuentas que se copió al crearla.
 */
export const editarEmpresaSchema = z
  .object({
    nombre: textoSchema(200).optional(),
    nombreComercial: editable(textoCorto(200)),
    nit: nitSchema.optional(),
    nrc: editable(nrcSchema),
    clasificacion: clasificacionContribuyenteSchema.optional(),
    actividadEconomica: editable(textoCorto(200)),
    direccion: editable(textoCorto(300)),
    telefono: editable(textoCorto(20)),
    correo: editable(correoSchema),
    modoNumeracion: modoNumeracionSchema.optional(),
  })
  .strict()
  .refine((e) => Object.values(e).some((v) => v !== undefined), { error: "No se envió ningún cambio." });
export type EditarEmpresa = z.infer<typeof editarEmpresaSchema>;
export type EditarEmpresaEntrada = z.input<typeof editarEmpresaSchema>;

/** Empresa tal como la devuelve la API. */
export interface EmpresaDetalle {
  id: string;
  nombre: string;
  nombreComercial: string | null;
  nit: string;
  nrc: string | null;
  tipoContribuyente: z.infer<typeof tipoContribuyenteSchema>;
  clasificacion: z.infer<typeof clasificacionContribuyenteSchema>;
  actividadEconomica: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  logoUrl: string | null;
  modoNumeracion: z.infer<typeof modoNumeracionSchema>;
  activa: boolean;
  /** Fecha y hora ISO 8601 */
  creadoEn: string;
  actualizadoEn: string;
}
/** Correo al que se enviará una invitación para unirse a la organización. */
export const invitarUsuarioSchema = z
  .object({
    correo: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "Correo inválido." }).max(150)),
    rol: z.enum(["administrador", "contador", "auxiliar", "consulta"]),
    sucursales: z.array(z.uuid()).default([]),
  })
  .superRefine(({ rol, sucursales }, ctx) => {
    if ((rol === "auxiliar" || rol === "consulta") && sucursales.length === 0) {
      ctx.addIssue({ code: "custom", path: ["sucursales"], message: "Asigne al menos una sucursal." });
    }
    if ((rol === "administrador" || rol === "contador") && sucursales.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["sucursales"],
        message: "Este rol tiene acceso a todas las sucursales.",
      });
    }
    if (new Set(sucursales).size !== sucursales.length) {
      ctx.addIssue({ code: "custom", path: ["sucursales"], message: "No repita sucursales." });
    }
  });
export type InvitarUsuario = z.infer<typeof invitarUsuarioSchema>;

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
