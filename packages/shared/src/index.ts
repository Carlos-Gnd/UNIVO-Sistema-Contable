export { Dinero, type Monto } from "./dinero/dinero";
export {
  validarPartida,
  type CuentaInfo,
  type LineaPartida,
  type ErrorLinea,
  type CodigoErrorLinea,
  type ResultadoValidacion,
} from "./contabilidad/partida";
// Esquemas Zod compartidos por la web (formularios) y la API (validación de entrada), con sus tipos
export * from "./esquemas";
// Validadores de NIT, DUI y NRC (S1-T37)
export * from "./identificacion/documentos";
