import Decimal from "decimal.js";
import { Dinero } from "../dinero/dinero";
import type { ConfiguracionPlanillaVista, EmpleadoPlanillaVista } from "../esquemas/planilla";
import { calcularRetencionesPlanilla } from "./calcular-retenciones";

const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export interface DatosEmpleadoCalculoPlanilla {
  empleadoId: string;
  nombres: string;
  apellidos: string;
  numeroIsss: string;
  nup: string;
  dui: string;
  puesto: string;
  area: string | null;
  salario: string;
}

export interface AjustesCalculoPlanilla {
  horasExtra: string;
  diasAusencia: string;
  otrosDescuentos: string;
}

/** Calcula salario, ajustes, retenciones y cuotas patronales de una persona. */
export function calcularEmpleadoPlanilla(
  empleado: DatosEmpleadoCalculoPlanilla,
  ajustes: AjustesCalculoPlanilla,
  configuracion: ConfiguracionPlanillaVista,
): EmpleadoPlanillaVista {
  const salario = Dinero.de(empleado.salario);
  const pagoHorasExtra = Dinero.de(
    new D(empleado.salario)
      .div(240)
      .times(2)
      .times(ajustes.horasExtra)
      .toDecimalPlaces(2, D.ROUND_HALF_UP)
      .toFixed(2),
  );
  const descuentoAusencia = Dinero.de(
    new D(empleado.salario)
      .div(30)
      .times(ajustes.diasAusencia)
      .toDecimalPlaces(2, D.ROUND_HALF_UP)
      .toFixed(2),
  );
  const bruto = salario.mas(pagoHorasExtra).menos(descuentoAusencia);
  if (bruto.esNegativo()) {
    throw new Error(`Los ajustes de ${empleado.dui} superan su salario del período.`);
  }

  const retenciones = calcularRetencionesPlanilla(bruto.aTexto(), configuracion);
  const otrosDescuentos = Dinero.de(ajustes.otrosDescuentos);
  const neto = retenciones.neto.menos(otrosDescuentos);
  if (neto.esNegativo()) {
    throw new Error(`Los descuentos de ${empleado.dui} superan su líquido a pagar.`);
  }

  return {
    empleadoId: empleado.empleadoId,
    nombres: empleado.nombres,
    apellidos: empleado.apellidos,
    numeroIsss: empleado.numeroIsss,
    nup: empleado.nup,
    dui: empleado.dui,
    puesto: empleado.puesto,
    area: empleado.area,
    salarioBase: salario.aTexto(),
    horasExtra: ajustes.horasExtra,
    pagoHorasExtra: pagoHorasExtra.aTexto(),
    diasAusencia: ajustes.diasAusencia,
    descuentoAusencia: descuentoAusencia.aTexto(),
    otrosDescuentos: otrosDescuentos.aTexto(),
    bruto: bruto.aTexto(),
    isssLaboral: retenciones.isssLaboral.aTexto(),
    afpLaboral: retenciones.afpLaboral.aTexto(),
    renta: retenciones.renta.aTexto(),
    isssPatronal: retenciones.isssPatronal.aTexto(),
    afpPatronal: retenciones.afpPatronal.aTexto(),
    neto: neto.aTexto(),
  };
}

/** Suma las cifras de personas con Dinero, conservando el redondeo al centavo. */
export function resumirPlanilla(empleados: readonly EmpleadoPlanillaVista[]) {
  const total = (campo: keyof EmpleadoPlanillaVista) =>
    Dinero.sumar(empleados.map((empleado) => empleado[campo] as string)).aTexto();
  const isssPatronal = total("isssPatronal");
  const afpPatronal = total("afpPatronal");
  return {
    bruto: total("bruto"),
    isssLaboral: total("isssLaboral"),
    afpLaboral: total("afpLaboral"),
    renta: total("renta"),
    otrosDescuentos: total("otrosDescuentos"),
    neto: total("neto"),
    isssPatronal,
    afpPatronal,
    gastoPatronal: Dinero.de(isssPatronal).mas(afpPatronal).aTexto(),
  };
}
