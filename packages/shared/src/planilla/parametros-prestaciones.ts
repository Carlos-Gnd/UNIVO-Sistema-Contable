/** Días corridos que representan un año de servicio para prestaciones. */
export const DIAS_POR_ANIO_DE_SERVICIO = 365;
/** Días salariales usados para convertir un sueldo mensual en salario diario. */
export const DIAS_POR_MES_SALARIAL = 30;
/** Meses del año usados para calcular una provisión mensual. */
export const MESES_POR_ANIO_DE_PROVISION = 12;
/** Aguinaldo anual para servicio menor a tres años. */
export const DIAS_AGUINALDO_BASE = 15;
/** Antigüedad desde la que el aguinaldo usa diecinueve días. */
export const ANIOS_ANTIGUEDAD_AGUINALDO_INTERMEDIO = 3;
/** Días de aguinaldo para antigüedad desde tres hasta menos de diez años. */
export const DIAS_AGUINALDO_INTERMEDIO = 19;
/** Antigüedad desde la que el aguinaldo usa veintiún días. */
export const ANIOS_ANTIGUEDAD_AGUINALDO_MAYOR = 10;
/** Días de aguinaldo para antigüedad de diez años o más. */
export const DIAS_AGUINALDO_MAYOR = 21;
/** Días de vacaciones antes de aplicar el recargo. */
export const DIAS_VACACIONES_ANUALES = 15;
/** Factor base del salario vacacional antes de agregar el recargo. */
export const FACTOR_BASE_VACACIONES = "1.00";
/** Recargo legal sobre el pago de vacaciones. */
export const RECARGO_VACACIONES = "0.30";
/** Salario mínimo mensual por defecto para parametrizar el tope de indemnización. */
export const SALARIO_MINIMO_MENSUAL_POR_DEFECTO = "408.80";
/** Cantidad de salarios mínimos que limita el salario base de indemnización. */
export const MULTIPLO_TOPE_SALARIO_MINIMO_INDEMNIZACION = 2;
/** Días de indemnización por cada año de servicio. */
export const DIAS_INDEMNIZACION_POR_ANIO = 30;
/** Mes en que se paga el aguinaldo. */
export const MES_PAGO_AGUINALDO = 12;
/** Día de corte para calcular el aguinaldo de diciembre. */
export const DIA_CORTE_AGUINALDO = 12;

/** Valores que pueden reemplazarse al calcular si la empresa usa otros parámetros. */
export interface ParametrosPrestaciones {
  diasPorAnioServicio: number;
  diasPorMesSalarial: number;
  mesesPorAnioProvision: number;
  diasAguinaldoBase: number;
  aniosAntiguedadAguinaldoIntermedio: number;
  diasAguinaldoIntermedio: number;
  aniosAntiguedadAguinaldoMayor: number;
  diasAguinaldoMayor: number;
  diasVacacionesAnuales: number;
  factorBaseVacaciones: string;
  recargoVacaciones: string;
  salarioMinimoMensual: string;
  multiploTopeSalarioMinimoIndemnizacion: number;
  diasIndemnizacionPorAnio: number;
  mesPagoAguinaldo: number;
  diaCorteAguinaldo: number;
}

export const PARAMETROS_PRESTACIONES = Object.freeze<ParametrosPrestaciones>({
  diasPorAnioServicio: DIAS_POR_ANIO_DE_SERVICIO,
  diasPorMesSalarial: DIAS_POR_MES_SALARIAL,
  mesesPorAnioProvision: MESES_POR_ANIO_DE_PROVISION,
  diasAguinaldoBase: DIAS_AGUINALDO_BASE,
  aniosAntiguedadAguinaldoIntermedio: ANIOS_ANTIGUEDAD_AGUINALDO_INTERMEDIO,
  diasAguinaldoIntermedio: DIAS_AGUINALDO_INTERMEDIO,
  aniosAntiguedadAguinaldoMayor: ANIOS_ANTIGUEDAD_AGUINALDO_MAYOR,
  diasAguinaldoMayor: DIAS_AGUINALDO_MAYOR,
  diasVacacionesAnuales: DIAS_VACACIONES_ANUALES,
  factorBaseVacaciones: FACTOR_BASE_VACACIONES,
  recargoVacaciones: RECARGO_VACACIONES,
  salarioMinimoMensual: SALARIO_MINIMO_MENSUAL_POR_DEFECTO,
  multiploTopeSalarioMinimoIndemnizacion: MULTIPLO_TOPE_SALARIO_MINIMO_INDEMNIZACION,
  diasIndemnizacionPorAnio: DIAS_INDEMNIZACION_POR_ANIO,
  mesPagoAguinaldo: MES_PAGO_AGUINALDO,
  diaCorteAguinaldo: DIA_CORTE_AGUINALDO,
});
