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
// Esquemas Zod compartidos por la web (formularios) y la API (validación de entrada), con sus tipos
export * from "./esquemas";
// Validadores de NIT, DUI y NRC (S1-T37)
export * from "./identificacion/documentos";
// Depreciación en línea recta y porcentajes fiscales del Art. 30 de la LISR (HU-81 y HU-82)
export * from "./contabilidad/depreciacion";
