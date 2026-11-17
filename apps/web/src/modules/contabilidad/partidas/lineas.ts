import { Dinero, validarPartida, type CuentaInfo, type ResultadoValidacion } from "@contable/shared";
import type { CuentaCatalogo, CuentaParaPartida } from "./tipos";

/** Una fila del detalle tal como se edita en el formulario: los montos son el texto que escribe el usuario. */
export interface FilaPartida {
  /** Identificador estable para React; no se envía a la API */
  clave: string;
  cuentaId: string;
  codigo: string;
  nombre: string;
  debe: string;
  haber: string;
}

/** Cantidad máxima de dígitos enteros que admite NUMERIC(14,2). */
const DIGITOS_ENTEROS = 12;

/**
 * Deja solo un monto válido mientras se escribe: dígitos, un punto y como máximo dos decimales.
 * Las comas de miles que trae un valor ya formateado o pegado se quitan.
 */
export function limpiarMonto(texto: string): string {
  let limpio = texto.replace(/[^\d.]/g, "");
  const punto = limpio.indexOf(".");
  if (punto !== -1) limpio = limpio.slice(0, punto + 1) + limpio.slice(punto + 1).replace(/\./g, "");
  const [entero = "", decimales] = limpio.split(".");
  const enteroCorto = entero.slice(0, DIGITOS_ENTEROS);
  return decimales === undefined ? enteroCorto : `${enteroCorto}.${decimales.slice(0, 2)}`;
}

/** Texto del formulario ("1,250.5", "12.", ".5" o "") convertido a un monto que entiende Dinero. */
export function montoDeTexto(texto: string): string {
  let t = texto.replace(/,/g, "").trim();
  if (t.endsWith(".")) t = t.slice(0, -1);
  if (t.startsWith(".")) t = `0${t}`;
  return /^\d+(\.\d+)?$/.test(t) ? t : "0";
}

/** Al salir del campo: formato con miles y dos decimales ("1,250.50"); cero o vacío quedan vacíos. */
export function pulirMonto(texto: string): string {
  const monto = Dinero.de(montoDeTexto(texto));
  return monto.esCero() ? "" : monto.formatear({ simbolo: false });
}

/** Valor que se envía a la API: texto con dos decimales ("1250.50"). */
export const montoParaApi = (texto: string) => Dinero.de(montoDeTexto(texto)).aTexto();

/** Resuelve qué cuentas son de último nivel cuando la API no lo indica. */
export function prepararCuentas(cuentas: readonly CuentaCatalogo[]): CuentaParaPartida[] {
  const padres = new Set(cuentas.map((c) => c.cuentaPadreId).filter((id): id is string => id !== null));
  return cuentas.map((c) => ({ ...c, imputable: c.imputable ?? !padres.has(c.id) }));
}

const sinAcentos = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Cuentas que se pueden usar en una partida (activas y de último nivel), filtradas por el inicio del
 * código o por cualquier parte del nombre, sin distinguir mayúsculas ni tildes.
 */
export function buscarCuentas(
  cuentas: readonly CuentaParaPartida[],
  consulta: string,
  limite = 50,
): CuentaParaPartida[] {
  const q = sinAcentos(consulta.trim());
  const resultado: CuentaParaPartida[] = [];
  for (const c of cuentas) {
    if (!c.activa || !c.imputable) continue;
    if (q && !c.codigo.startsWith(q) && !sinAcentos(c.nombre).includes(q)) continue;
    resultado.push(c);
    if (resultado.length === limite) break;
  }
  return resultado;
}

/**
 * Totales y errores de captura de la partida con las mismas reglas del dominio (decimal.js), para mostrar
 * debe, haber y diferencia en vivo (S1-T81).
 */
export function calcularPartida(
  filas: readonly FilaPartida[],
  cuentas: readonly CuentaParaPartida[],
): ResultadoValidacion {
  const info = new Map<string, CuentaInfo>(
    cuentas.map((c) => [c.id, { id: c.id, codigo: c.codigo, activa: c.activa, imputable: c.imputable }]),
  );
  return validarPartida(
    filas.map((f) => ({ cuentaId: f.cuentaId, debe: montoDeTexto(f.debe), haber: montoDeTexto(f.haber) })),
    info,
  );
}

let contador = 0;
/** Clave única para una fila nueva. */
export const nuevaClave = () => `fila-${Date.now().toString(36)}-${(contador++).toString(36)}`;
