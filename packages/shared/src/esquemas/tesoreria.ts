import { z } from "zod";
import { Dinero } from "../dinero/dinero";
import { editable, fechaSchema, idSchema, montoSchema, opcional, textoSchema } from "./comunes";

export const TIPOS_CUENTA_TESORERIA = ["caja", "banco"] as const;
export const tipoCuentaTesoreriaSchema = z.enum(TIPOS_CUENTA_TESORERIA);
export type TipoCuentaTesoreria = z.infer<typeof tipoCuentaTesoreriaSchema>;

export const TIPOS_MOVIMIENTO_BANCARIO = ["cheque", "remesa", "nota_cargo", "nota_abono"] as const;
export const tipoMovimientoBancarioSchema = z.enum(TIPOS_MOVIMIENTO_BANCARIO);
export type TipoMovimientoBancario = z.infer<typeof tipoMovimientoBancarioSchema>;

export const ESTADOS_CHEQUE_BANCARIO = ["emitido", "cobrado", "anulado"] as const;
export const estadoChequeBancarioSchema = z.enum(ESTADOS_CHEQUE_BANCARIO);
export type EstadoChequeBancario = z.infer<typeof estadoChequeBancarioSchema>;

/**
 * Caja o cuenta bancaria vinculada a una cuenta contable de efectivo (1101…) de último nivel. Un banco necesita
 * su entidad y su número de cuenta; una caja no los lleva. La sucursal es opcional: sin ella es de toda la empresa.
 */
export const crearCuentaTesoreriaSchema = z
  .object({
    tipo: tipoCuentaTesoreriaSchema,
    nombre: textoSchema(100),
    cuentaId: idSchema,
    sucursalId: opcional(idSchema),
    banco: opcional(textoSchema(80)),
    numeroCuenta: opcional(textoSchema(40)),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "banco") {
      if (!v.banco) ctx.addIssue({ code: "custom", path: ["banco"], message: "El banco es obligatorio." });
      if (!v.numeroCuenta)
        ctx.addIssue({
          code: "custom",
          path: ["numeroCuenta"],
          message: "El número de cuenta es obligatorio.",
        });
    } else if (v.banco || v.numeroCuenta) {
      ctx.addIssue({
        code: "custom",
        path: ["banco"],
        message: "Una caja no lleva banco ni número de cuenta.",
      });
    }
  });
export type CrearCuentaTesoreria = z.infer<typeof crearCuentaTesoreriaSchema>;

/** Edita los campos enviados; el tipo y la cuenta contable no cambian. { activa: false } la inactiva. */
export const editarCuentaTesoreriaSchema = z
  .object({
    nombre: textoSchema(100).optional(),
    banco: textoSchema(80).optional(),
    numeroCuenta: textoSchema(40).optional(),
    sucursalId: editable(idSchema),
    activa: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { error: "No hay cambios que guardar." });
export type EditarCuentaTesoreria = z.infer<typeof editarCuentaTesoreriaSchema>;

export interface CuentaTesoreriaVista {
  id: string;
  tipo: TipoCuentaTesoreria;
  nombre: string;
  banco: string | null;
  numeroCuenta: string | null;
  cuentaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  sucursalId: string | null;
  sucursal: string | null;
  activa: boolean;
  /** Saldo actual según los libros (partidas contabilizadas y anuladas), con dos decimales */
  saldo: string;
}

const montoMovimientoSchema = montoSchema.refine((monto) => Dinero.de(monto).mayorQue("0.00"), {
  error: "El monto debe ser mayor que cero.",
});

/** Movimiento bancario con su asiento en borrador. */
export const crearMovimientoBancarioSchema = z.object({
  cuentaTesoreriaId: idSchema,
  sucursalId: idSchema,
  cuentaContrapartidaId: idSchema,
  tipo: tipoMovimientoBancarioSchema,
  fecha: fechaSchema,
  referencia: textoSchema(60),
  comprobante: textoSchema(60),
  beneficiario: opcional(textoSchema(150)),
  concepto: textoSchema(200),
  monto: montoMovimientoSchema,
});
export type CrearMovimientoBancario = z.infer<typeof crearMovimientoBancarioSchema>;

export const filtrarMovimientosBancariosSchema = z
  .object({
    cuentaTesoreriaId: idSchema,
    desde: fechaSchema,
    hasta: fechaSchema,
  })
  .refine((filtro) => filtro.hasta >= filtro.desde, {
    path: ["hasta"],
    error: "La fecha final debe ser igual o posterior a la fecha inicial.",
  });
export type FiltroMovimientosBancarios = z.infer<typeof filtrarMovimientosBancariosSchema>;

export const cambiarEstadoChequeSchema = z.object({
  estado: z.enum(["cobrado", "anulado"]),
  fecha: fechaSchema,
});
export type CambiarEstadoCheque = z.infer<typeof cambiarEstadoChequeSchema>;

export interface MovimientoBancarioVista {
  id: string;
  cuentaTesoreriaId: string;
  cuentaBancaria: string;
  sucursalId: string;
  sucursal: string;
  cuentaContrapartidaId: string;
  cuentaContrapartidaCodigo: string;
  cuentaContrapartidaNombre: string;
  tipo: TipoMovimientoBancario;
  fecha: string;
  referencia: string;
  comprobante: string;
  beneficiario: string | null;
  concepto: string;
  monto: string;
  estadoCheque: EstadoChequeBancario | null;
  fechaEstado: string | null;
  partidaId: string;
  partidaAnulacionId: string | null;
  partidaEstado: "borrador" | "contabilizada" | "anulada";
}

export const crearConciliacionBancariaSchema = z.object({
  cuentaTesoreriaId: idSchema,
  fechaCorte: fechaSchema,
  saldoEstado: montoSchema,
});
export type CrearConciliacionBancaria = z.infer<typeof crearConciliacionBancariaSchema>;

export const actualizarDetalleConciliacionSchema = z.object({
  partidaDetalleId: idSchema,
  conciliado: z.boolean(),
});
export type ActualizarDetalleConciliacion = z.infer<typeof actualizarDetalleConciliacionSchema>;

export interface LineaConciliacionBancariaVista {
  partidaDetalleId: string;
  fecha: string;
  referencia: string | null;
  concepto: string;
  debe: string;
  haber: string;
  conciliado: boolean;
}

export interface ConciliacionBancariaVista {
  id: string;
  cuentaTesoreriaId: string;
  cuentaBancaria: string;
  fechaCorte: string;
  saldoEstado: string;
  depositosEnTransito: string;
  chequesEnCirculacion: string;
  saldoLibros: string;
  diferencia: string;
  lineas: LineaConciliacionBancariaVista[];
  lineasEstadoCuenta: ResultadoImportacionEstadoCuenta[];
}

export interface ResultadoImportacionEstadoCuenta {
  numeroFila: number;
  fecha: string | null;
  referencia: string;
  descripcion: string;
  monto: string | null;
  estado: "coincide" | "revision" | "error" | "duplicada";
  detalle: string | null;
  partidaDetalleId: string | null;
}

const montoPositivoSchema = montoSchema.refine((monto) => Dinero.de(monto).mayorQue("0.00"), {
  error: "El monto debe ser mayor que cero.",
});

/** Apertura de un fondo fijo; la cuenta de caja debe ser una subcuenta 110102 imputable. */
export const crearCajaChicaSchema = z.object({
  sucursalId: idSchema,
  cuentaTesoreriaId: idSchema,
  cuentaOrigenId: idSchema,
  fondoFijo: montoPositivoSchema,
  fecha: fechaSchema,
});
export type CrearCajaChica = z.infer<typeof crearCajaChicaSchema>;

/** Vale de gasto menor que compromete efectivo hasta que se genere su partida de reintegro. */
export const crearValeCajaChicaSchema = z
  .object({
    fecha: fechaSchema,
    comprobante: textoSchema(60),
    concepto: textoSchema(200),
    montoNeto: montoSchema,
    iva: montoSchema,
    cuentaGastoId: idSchema,
  })
  .superRefine((vale, ctx) => {
    if (!Dinero.de(vale.montoNeto).mas(vale.iva).mayorQue("0.00")) {
      ctx.addIssue({
        code: "custom",
        path: ["montoNeto"],
        message: "El total del vale debe ser mayor que cero.",
      });
    }
  });
export type CrearValeCajaChica = z.infer<typeof crearValeCajaChicaSchema>;

export const reintegrarCajaChicaSchema = z.object({
  fecha: fechaSchema,
  cuentaOrigenId: idSchema,
});
export type ReintegrarCajaChica = z.infer<typeof reintegrarCajaChicaSchema>;

export interface ValeCajaChicaVista {
  id: string;
  fecha: string;
  comprobante: string;
  concepto: string;
  montoNeto: string;
  iva: string;
  total: string;
  estado: "por_reintegrar" | "reintegrado";
  cuentaGastoId: string;
  cuentaGastoCodigo: string;
  cuentaGastoNombre: string;
  partidaReintegroId: string | null;
}

export interface CajaChicaVista {
  id: string;
  sucursalId: string;
  sucursal: string;
  cuentaTesoreriaId: string;
  cuentaCodigo: string;
  cuentaNombre: string;
  fondoFijo: string;
  valesPorReintegrar: string;
  efectivoDisponible: string;
  totalVales: string;
  partidaAperturaId: string;
  vales: ValeCajaChicaVista[];
}
