import Decimal from "decimal.js";
import { Dinero } from "../dinero/dinero";
import type { EmpleadoPrestacionesVista, ResumenPrestacionesVista } from "../esquemas/planilla";
import { PARAMETROS_PRESTACIONES, type ParametrosPrestaciones } from "./parametros-prestaciones";

const D = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
const MILISEGUNDOS_POR_DIA = 86_400_000;

export interface DatosEmpleadoPrestaciones {
  empleadoId: string;
  dui: string;
  puesto: string;
  area: string | null;
  fechaIngreso: string;
  salario: string;
}

function fechaUtc(fecha: string): Date {
  const valor = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(valor.getTime()) || valor.toISOString().slice(0, 10) !== fecha) {
    throw new Error("La fecha de cálculo o de ingreso no es válida.");
  }
  return valor;
}

function diasCorridos(desde: string, hasta: string): number {
  const diferencia = fechaUtc(hasta).getTime() - fechaUtc(desde).getTime();
  return Math.max(0, Math.floor(diferencia / MILISEGUNDOS_POR_DIA));
}

function fechaCorteAguinaldo(fechaCalculo: string, p: ParametrosPrestaciones): string {
  const fecha = fechaUtc(fechaCalculo);
  const mes = fecha.getUTCMonth() + 1;
  const dia = fecha.getUTCDate();
  if (mes !== p.mesPagoAguinaldo || dia <= p.diaCorteAguinaldo) return fechaCalculo;
  return `${fecha.getUTCFullYear()}-${String(p.mesPagoAguinaldo).padStart(2, "0")}-${String(p.diaCorteAguinaldo).padStart(2, "0")}`;
}

function diasAguinaldoPorAntiguedad(diasServicio: number, p: ParametrosPrestaciones): number {
  const aniosCompletos = Math.floor(diasServicio / p.diasPorAnioServicio);
  if (aniosCompletos >= p.aniosAntiguedadAguinaldoMayor) return p.diasAguinaldoMayor;
  if (aniosCompletos >= p.aniosAntiguedadAguinaldoIntermedio) return p.diasAguinaldoIntermedio;
  return p.diasAguinaldoBase;
}

function aTextoDinero(valor: Decimal): string {
  return Dinero.de(valor.toFixed(2, D.ROUND_HALF_UP)).aTexto();
}

function salarioDiario(salario: string, p: ParametrosPrestaciones): Decimal {
  return new D(salario).div(p.diasPorMesSalarial);
}

function provisionMensual(salarioDiarioDecimal: Decimal, dias: Decimal.Value, p: ParametrosPrestaciones) {
  return aTextoDinero(salarioDiarioDecimal.times(dias).div(p.mesesPorAnioProvision));
}

/** Calcula aguinaldo, vacaciones e indemnización con redondeo monetario al centavo. */
export function calcularPrestacionesEmpleado(
  empleado: DatosEmpleadoPrestaciones,
  fechaCalculo: string,
  parametros: Partial<ParametrosPrestaciones> = {},
): EmpleadoPrestacionesVista {
  const p = { ...PARAMETROS_PRESTACIONES, ...parametros };
  const diasServicio = diasCorridos(empleado.fechaIngreso, fechaCalculo);
  const fechaCorte = fechaCorteAguinaldo(fechaCalculo, p);
  const diasServicioAguinaldo = diasCorridos(empleado.fechaIngreso, fechaCorte);
  const diasAguinaldo = diasAguinaldoPorAntiguedad(diasServicioAguinaldo, p);
  const diario = salarioDiario(empleado.salario, p);
  const montoAguinaldo =
    Math.floor(diasServicioAguinaldo / p.diasPorAnioServicio) === 0
      ? diario.times(p.diasAguinaldoBase).times(diasServicioAguinaldo).div(p.diasPorAnioServicio)
      : diario.times(diasAguinaldo);

  const esVacacionElegible = diasServicio >= p.diasPorAnioServicio;
  const factorVacacional = new D(p.diasVacacionesAnuales).times(
    new D(p.factorBaseVacaciones).plus(p.recargoVacaciones),
  );
  const diasPeriodoVacacional = esVacacionElegible
    ? diasServicio % p.diasPorAnioServicio || p.diasPorAnioServicio
    : 0;
  const montoVacaciones = esVacacionElegible
    ? diario.times(factorVacacional).times(diasPeriodoVacacional).div(p.diasPorAnioServicio)
    : new D(0);

  const topeSalarioIndemnizacion = new D(p.salarioMinimoMensual).times(
    p.multiploTopeSalarioMinimoIndemnizacion,
  );
  const salarioBaseIndemnizacion = new D(empleado.salario).lessThan(topeSalarioIndemnizacion)
    ? new D(empleado.salario)
    : topeSalarioIndemnizacion;
  const diarioIndemnizacion = salarioDiario(salarioBaseIndemnizacion.toFixed(2), p);
  const montoIndemnizacion = diarioIndemnizacion
    .times(p.diasIndemnizacionPorAnio)
    .times(diasServicio)
    .div(p.diasPorAnioServicio);

  return {
    empleadoId: empleado.empleadoId,
    dui: empleado.dui,
    puesto: empleado.puesto,
    area: empleado.area,
    fechaIngreso: empleado.fechaIngreso,
    salarioBase: Dinero.de(empleado.salario).aTexto(),
    diasServicio,
    aniosServicio: new D(diasServicio).div(p.diasPorAnioServicio).toDecimalPlaces(4).toFixed(4),
    fechaCorteAguinaldo: fechaCorte,
    diasAguinaldo: new D(diasAguinaldo).toFixed(2),
    montoAguinaldo: aTextoDinero(montoAguinaldo),
    provisionAguinaldoMensual: provisionMensual(diario, diasAguinaldo, p),
    diasPeriodoVacacional,
    montoVacaciones: aTextoDinero(montoVacaciones),
    provisionVacacionesMensual: esVacacionElegible ? provisionMensual(diario, factorVacacional, p) : "0.00",
    salarioBaseIndemnizacion: Dinero.de(salarioBaseIndemnizacion.toFixed(2)).aTexto(),
    montoIndemnizacion: aTextoDinero(montoIndemnizacion),
    provisionIndemnizacionMensual: provisionMensual(diarioIndemnizacion, p.diasIndemnizacionPorAnio, p),
  };
}

/** Resume los beneficios y provisiones sin perder el redondeo de cada empleado. */
export function resumirPrestaciones(
  empleados: readonly EmpleadoPrestacionesVista[],
): ResumenPrestacionesVista {
  const total = (campo: keyof EmpleadoPrestacionesVista) =>
    Dinero.sumar(empleados.map((empleado) => empleado[campo] as string)).aTexto();
  const provisiones = [
    total("provisionAguinaldoMensual"),
    total("provisionVacacionesMensual"),
    total("provisionIndemnizacionMensual"),
  ];
  return {
    montoAguinaldo: total("montoAguinaldo"),
    provisionAguinaldoMensual: total("provisionAguinaldoMensual"),
    montoVacaciones: total("montoVacaciones"),
    provisionVacacionesMensual: total("provisionVacacionesMensual"),
    montoIndemnizacion: total("montoIndemnizacion"),
    provisionIndemnizacionMensual: total("provisionIndemnizacionMensual"),
    provisionMensualTotal: Dinero.sumar(provisiones).aTexto(),
  };
}
