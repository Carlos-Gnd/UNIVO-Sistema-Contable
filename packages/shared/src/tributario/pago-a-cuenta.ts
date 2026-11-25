import { Dinero } from "../dinero/dinero";

/** Tasa del pago a cuenta del impuesto sobre la renta: 1.75 % de los ingresos brutos del mes (Art. 151 del Código Tributario). */
export const TASA_PAGO_A_CUENTA = "1.75";

/** Cuentas del catálogo base que usa el pago a cuenta (F-14). */
export const CUENTAS_PAGO_A_CUENTA = {
  /** Ingresos brutos: ventas (5101 y subcuentas). */
  ingresos: "5101",
  /** Activo: pago a cuenta anticipado; es la cuenta con la que el cierre anual (HU-34) acredita el ISR. */
  pagoACuentaActivo: "111104",
  /** Pasivo: pago a cuenta por pagar a Hacienda. */
  pagoACuentaPasivo: "211101",
  /** Pasivo: renta retenida (planilla y servicios) por enterar con el F-14. */
  retencionesRenta: "210604",
} as const;

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
