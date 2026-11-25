import { Dinero } from "../dinero/dinero";
import type { DetalleIsrAnual, TramoIsr } from "../esquemas/isr-anual";

export interface EntradaIsrAnual {
  tipoContribuyente: "persona_natural" | "sociedad";
  utilidadAntesImpuesto: string;
  pagosACuenta: string;
  tasaSociedad?: string;
  tramos?: readonly TramoIsr[];
  capitalSocial?: string;
  reservaLegalActual?: string;
}

const maximoCero = (valor: Dinero) => (valor.esNegativo() ? Dinero.cero() : valor);
const minimo = (a: Dinero, b: Dinero) => (a.mayorQue(b) ? b : a);

function impuestoPorTramos(base: Dinero, tramos: readonly TramoIsr[]): { monto: Dinero; tramo: TramoIsr } {
  const tramo = tramos.find(
    (t) => t.hasta === null || Dinero.de(t.hasta).igualA(base) || Dinero.de(t.hasta).mayorQue(base),
  );
  if (!tramo) throw new Error("La tabla anual de ISR no contiene un tramo aplicable.");
  const exceso = maximoCero(base.menos(tramo.desde));
  return { monto: exceso.porcentaje(tramo.porcentaje).mas(tramo.cuotaFija), tramo };
}

/** Calcula el ISR anual, acredita el pago a cuenta y determina la reserva legal para sociedades. */
export function calcularIsrAnual(entrada: EntradaIsrAnual): DetalleIsrAnual {
  const utilidadAntesImpuesto = Dinero.de(entrada.utilidadAntesImpuesto);
  const baseImponible = maximoCero(utilidadAntesImpuesto);
  const pagosACuenta = maximoCero(Dinero.de(entrada.pagosACuenta));
  const capitalSocial = maximoCero(Dinero.de(entrada.capitalSocial ?? "0.00"));
  const reservaLegalActual = maximoCero(Dinero.de(entrada.reservaLegalActual ?? "0.00"));

  let impuestoDeterminado: Dinero;
  let tramoAplicado: TramoIsr | null = null;
  let tasaAplicada: string;

  if (entrada.tipoContribuyente === "persona_natural") {
    if (!entrada.tramos || entrada.tramos.length === 0) {
      throw new Error("Configure los tramos anuales del ISR antes de calcular.");
    }
    const calculo = impuestoPorTramos(baseImponible, entrada.tramos);
    impuestoDeterminado = calculo.monto;
    tramoAplicado = calculo.tramo;
    tasaAplicada = calculo.tramo.porcentaje;
  } else {
    if (entrada.tasaSociedad === undefined) {
      throw new Error("Configure la tasa de ISR de la sociedad antes de calcular.");
    }
    tasaAplicada = entrada.tasaSociedad;
    impuestoDeterminado = baseImponible.porcentaje(entrada.tasaSociedad);
  }

  const pagosAplicados = minimo(pagosACuenta, impuestoDeterminado);
  const impuestoPendiente = maximoCero(impuestoDeterminado.menos(pagosAplicados));
  const saldoAFavor = maximoCero(pagosACuenta.menos(pagosAplicados));
  const utilidadDespuesDeImpuesto = utilidadAntesImpuesto.menos(impuestoDeterminado);

  let limiteReservaLegal = Dinero.cero();
  let reservaLegalDisponible = Dinero.cero();
  let reservaLegalAProvisionar = Dinero.cero();
  if (entrada.tipoContribuyente === "sociedad") {
    limiteReservaLegal = capitalSocial.porcentaje("20.00");
    reservaLegalDisponible = maximoCero(limiteReservaLegal.menos(reservaLegalActual));
    const utilidadNetaPositiva = maximoCero(utilidadDespuesDeImpuesto);
    reservaLegalAProvisionar = minimo(utilidadNetaPositiva.porcentaje("7.00"), reservaLegalDisponible);
  }

  return {
    utilidadAntesImpuesto: utilidadAntesImpuesto.aTexto(),
    baseImponible: baseImponible.aTexto(),
    impuestoDeterminado: impuestoDeterminado.aTexto(),
    pagosACuenta: pagosACuenta.aTexto(),
    pagosAplicados: pagosAplicados.aTexto(),
    impuestoPendiente: impuestoPendiente.aTexto(),
    saldoAFavor: saldoAFavor.aTexto(),
    utilidadDespuesDeImpuesto: utilidadDespuesDeImpuesto.aTexto(),
    capitalSocial: capitalSocial.aTexto(),
    reservaLegalActual: reservaLegalActual.aTexto(),
    limiteReservaLegal: limiteReservaLegal.aTexto(),
    reservaLegalDisponible: reservaLegalDisponible.aTexto(),
    reservaLegalAProvisionar: reservaLegalAProvisionar.aTexto(),
    tramoAplicado,
    tasaAplicada,
  };
}
