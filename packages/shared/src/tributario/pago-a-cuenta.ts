import { Dinero } from "../dinero/dinero";

/** Tasa del pago a cuenta del impuesto sobre la renta: 1.75 % de los ingresos brutos del mes (Art. 151 del Código Tributario). */
export const TASA_PAGO_A_CUENTA = "1.75";

/** Cuentas del catálogo base que usa el pago a cuenta (F-14). */
export const CUENTAS_PAGO_A_CUENTA = {
  /** Ventas (5101 y subcuentas). */
  ingresos: "5101",
  /** Otros ingresos (clase 52: financieros, otras ganancias…), que también integran los ingresos brutos. */
  otrosIngresos: "52",
  /**
   * Cuentas de la clase 52 que NO integran la base: 5202 (ganancia en venta de activo de explotación) tiene otro
   * tratamiento (ganancia de capital). Dudoso: confirmar con la docente; para incluirla basta vaciar esta lista.
   */
  ingresosExcluidos: ["5202"],
  /** Devoluciones y rebajas sobre ventas (4103, deudora): restan de la base. */
  devolucionesVentas: "4103",
  /** Activo: pago a cuenta anticipado; es la cuenta con la que el cierre anual (HU-34) acredita el ISR. */
  pagoACuentaActivo: "111104",
  /** Pasivo: pago a cuenta por pagar a Hacienda. */
  pagoACuentaPasivo: "211101",
  /** Pasivo: renta retenida (planilla y servicios) por enterar con el F-14. */
  retencionesRenta: "210604",
} as const satisfies Record<string, string | readonly string[]>;

/** Prefijos de código cuyo movimiento acreedor neto forma los ingresos brutos (4103 es deudora y resta sola). */
export const CUENTAS_BASE_PAGO_A_CUENTA: readonly string[] = [
  CUENTAS_PAGO_A_CUENTA.ingresos,
  CUENTAS_PAGO_A_CUENTA.otrosIngresos,
  CUENTAS_PAGO_A_CUENTA.devolucionesVentas,
];

export interface EntradaPagoACuenta {
  ingresosBrutos: string;
  retencionesPlanilla: string;
  retencionesServicios: string;
  tasa?: string;
}

export interface ResultadoPagoACuenta {
  tasa: string;
  ingresosBrutos: string;
  pagoACuenta: string;
  retencionesPlanilla: string;
  retencionesServicios: string;
  totalRetenciones: string;
  totalAEnterar: string;
}

const noNegativo = (valor: Dinero) => (valor.esNegativo() ? Dinero.cero() : valor);

/**
 * Calcula el F-14 del mes: pago a cuenta sobre los ingresos brutos (nunca negativo) más las retenciones de renta,
 * que se enteran junto con él. Las retenciones ya vienen registradas en la contabilidad; aquí solo se suman.
 */
export function calcularPagoACuenta(entrada: EntradaPagoACuenta): ResultadoPagoACuenta {
  const tasa = entrada.tasa ?? TASA_PAGO_A_CUENTA;
  const ingresos = noNegativo(Dinero.de(entrada.ingresosBrutos));
  const planilla = noNegativo(Dinero.de(entrada.retencionesPlanilla));
  const servicios = noNegativo(Dinero.de(entrada.retencionesServicios));
  const pago = ingresos.porcentaje(tasa);
  const retenciones = planilla.mas(servicios);
  return {
    tasa: Dinero.de(tasa).aTexto(),
    ingresosBrutos: ingresos.aTexto(),
    pagoACuenta: pago.aTexto(),
    retencionesPlanilla: planilla.aTexto(),
    retencionesServicios: servicios.aTexto(),
    totalRetenciones: retenciones.aTexto(),
    totalAEnterar: pago.mas(retenciones).aTexto(),
  };
}
