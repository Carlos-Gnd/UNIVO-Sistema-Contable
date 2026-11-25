export { Dinero, calcularProporcion, type Monto } from "./dinero/dinero";
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
// Valuación de existencias y kardex: promedio ponderado, PEPS y costo específico (HU-65, HU-66)
export {
  ExistenciaInsuficienteError,
  ExistenciasProducto,
  armarKardex,
  costoTotalDeSeries,
  costoTotalDeEntrada,
  costoUnitarioDeTotal,
  distribuirCostoPorUnidad,
  type MovimientoParaKardex,
  type MetodoValuacionKardex,
  type ResultadoKardex,
} from "./inventario/valuacion";
export { diferenciaCantidadToma, sumarCantidadesToma, cantidadTomaEsCero } from "./inventario/toma-fisica";
// Totales de compras y ventas: IVA, retención y percepción del 1 % (HU-59, HU-60)
export {
  MINIMO_RETENCION_PERCEPCION,
  TASA_IVA,
  TASA_RETENCION_PERCEPCION,
  calcularTotalesDocumento,
  type ClaseGravamen,
  type EntradaCalculoDocumento,
  type LineaParaCalculo,
  type OperacionComercial,
  type TipoDocumentoComercial,
  type TotalesDocumento,
} from "./comercial/calculo-documento";
export { motivoCuentaNoPermitida } from "./comercial/cuentas-permitidas";
export { calcularTotalesNota } from "./comercial/calculo-nota";
export { cantidadIgual, cantidadMayor, restarCantidades } from "./comercial/cantidades";
