export { Dinero, type Monto } from "./dinero/dinero";
export {
  validarPartida,
  type CuentaInfo,
  type LineaPartida,
  type ErrorLinea,
  type CodigoErrorLinea,
  type ResultadoValidacion,
} from "./contabilidad/partida";
export { saldoContrarioANaturaleza } from "./contabilidad/saldo-contrario";
export { calcularIsrAnual, type EntradaIsrAnual } from "./contabilidad/isr-anual";
export { calcularRetencionesPlanilla, type RetencionesPlanilla } from "./planilla/calcular-retenciones";
export {
  calcularEmpleadoPlanilla,
  resumirPlanilla,
  type AjustesCalculoPlanilla,
  type DatosEmpleadoCalculoPlanilla,
} from "./planilla/calcular-planilla";
export {
  calcularPrestacionesEmpleado,
  resumirPrestaciones,
  type DatosEmpleadoPrestaciones,
} from "./planilla/calcular-prestaciones";
export * from "./planilla/parametros-prestaciones";
export * from "./planilla/distribucion-gasto";
// Esquemas Zod compartidos por la web (formularios) y la API (validación de entrada), con sus tipos
export * from "./esquemas";
// Validadores de NIT, DUI y NRC (S1-T37)
export * from "./identificacion/documentos";
// Valuación de existencias y kardex: promedio ponderado y PEPS (HU-65)
export {
  ExistenciaInsuficienteError,
  ExistenciasProducto,
  armarKardex,
  costoTotalDeEntrada,
  type MovimientoParaKardex,
  type ResultadoKardex,
} from "./inventario/valuacion";
