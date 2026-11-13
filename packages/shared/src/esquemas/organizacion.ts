import { z } from "zod";
import { textoOpcionalSchema, textoSchema } from "./comunes";
import { clasificacionContribuyenteSchema, modoNumeracionSchema, tipoContribuyenteSchema } from "./enums";

/** NIT de 14 dígitos (0614-010190-101-1) o DUI homologado como NIT (01234567-8). */
export const nitSchema = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{6}-\d{3}-\d|\d{8}-\d)$/, {
    error: "El NIT debe tener el formato 0000-000000-000-0 o el DUI 00000000-0.",
  });

/** Número de Registro de Contribuyente (IVA): dígitos, guion y dígito verificador. */
export const nrcSchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}-\d$/, { error: "El NRC debe tener el formato 000000-0." });

export const crearEmpresaSchema = z.object({
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
});
export type CrearEmpresa = z.infer<typeof crearEmpresaSchema>;
export type CrearEmpresaEntrada = z.input<typeof crearEmpresaSchema>;

/** Correo al que se enviara una invitacion para unirse a la organizacion. */
export const invitarUsuarioSchema = z.object({
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Correo invalido." }).max(150)),
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
