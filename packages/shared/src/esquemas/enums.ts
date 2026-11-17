import { z } from "zod";

// Mismos valores que los enum de packages/db/prisma/schema.prisma

export const tipoContribuyenteSchema = z.enum(["persona_natural", "sociedad"]);
export type TipoContribuyente = z.infer<typeof tipoContribuyenteSchema>;

export const clasificacionContribuyenteSchema = z.enum(["grande", "mediano", "otro"]);
export type ClasificacionContribuyente = z.infer<typeof clasificacionContribuyenteSchema>;

export const modoNumeracionSchema = z.enum(["mensual", "anual", "por_tipo"]);
export type ModoNumeracion = z.infer<typeof modoNumeracionSchema>;

export const naturalezaSchema = z.enum(["deudora", "acreedora"]);
export type Naturaleza = z.infer<typeof naturalezaSchema>;

export const tipoCuentaSchema = z.enum([
  "activo",
  "pasivo",
  "patrimonio",
  "costos_gastos",
  "ingresos",
  "liquidadora",
  "orden",
]);
export type TipoCuenta = z.infer<typeof tipoCuentaSchema>;

export const estadoPeriodoSchema = z.enum(["abierto", "cerrado"]);
export type EstadoPeriodo = z.infer<typeof estadoPeriodoSchema>;

export const tipoPartidaSchema = z.enum([
  "apertura",
  "operacion",
  "ajuste",
  "cierre",
  "reapertura",
  "reversion",
]);
export type TipoPartida = z.infer<typeof tipoPartidaSchema>;

export const estadoPartidaSchema = z.enum(["borrador", "contabilizada", "anulada"]);
export type EstadoPartida = z.infer<typeof estadoPartidaSchema>;
