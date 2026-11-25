import { z } from "zod";
import { editable, opcional, textoOpcionalSchema, textoSchema } from "./comunes";
import { clasificacionContribuyenteSchema, type ClasificacionContribuyente } from "./enums";
import { nitSchema, nrcSchema } from "./organizacion";

const correoSchema = z.email({ error: "Correo inválido." }).max(150, { error: "Máximo 150 caracteres." });
const textoCorto = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, { error: `Máximo ${maximo} caracteres.` });

const diasCreditoSchema = z.coerce
  .number({ error: "Los días de crédito deben ser un número." })
  .int({ error: "Los días de crédito deben ser un número entero." })
  .min(0, { error: "Los días de crédito no pueden ser negativos." })
  .max(365, { error: "Máximo 365 días de crédito." });

const MENSAJE_ROL = "Marca al menos una opción: cliente o proveedor.";

/** Alta de un cliente o proveedor (HU-58): NIT con dígito verificador, NRC con formato y clasificación. */
export const crearTerceroSchema = z
  .object({
    nombre: textoSchema(200),
    nit: nitSchema,
    nrc: opcional(nrcSchema),
    actividadEconomica: textoOpcionalSchema(200),
    clasificacion: clasificacionContribuyenteSchema.default("otro"),
    direccion: textoOpcionalSchema(300),
    telefono: textoOpcionalSchema(20),
    correo: opcional(correoSchema),
    esCliente: z.boolean().default(false),
    esProveedor: z.boolean().default(false),
    diasCredito: diasCreditoSchema.default(0),
  })
  .refine((t) => t.esCliente || t.esProveedor, { error: MENSAJE_ROL, path: ["esCliente"] });
export type CrearTercero = z.infer<typeof crearTerceroSchema>;

/** Edita los campos enviados; null o vacío borra un dato opcional y { activo: false } lo inactiva. */
export const editarTerceroSchema = z
  .object({
    nombre: textoSchema(200).optional(),
    nit: nitSchema.optional(),
    nrc: editable(nrcSchema),
    actividadEconomica: editable(textoCorto(200)),
    clasificacion: clasificacionContribuyenteSchema.optional(),
    direccion: editable(textoCorto(300)),
    telefono: editable(textoCorto(20)),
    correo: editable(correoSchema),
    esCliente: z.boolean().optional(),
    esProveedor: z.boolean().optional(),
    diasCredito: diasCreditoSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "No hay cambios que guardar." });
export type EditarTercero = z.infer<typeof editarTerceroSchema>;

export interface TerceroVista {
  id: string;
  nombre: string;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  clasificacion: ClasificacionContribuyente;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  diasCredito: number;
  activo: boolean;
}

/** Filtros de la lista: ?rol=cliente|proveedor, ?busqueda (nombre, NIT o NRC) y ?activo=true|false. */
export const ROLES_TERCERO = ["cliente", "proveedor"] as const;
export const rolTerceroSchema = z.enum(ROLES_TERCERO);
export type RolTercero = z.infer<typeof rolTerceroSchema>;
