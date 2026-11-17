// Validadores de documentos tributarios de El Salvador (S1-T37, HU-06).
// Algoritmos de dígito verificador de la DGII; se verificaron con los casos de la librería idsv-js.

const DUI = /^\d{8}-\d$/;
const NIT = /^\d{4}-\d{6}-\d{3}-\d$/;
const NRC = /^\d{1,8}-\d$/;

const digitos = (texto: string) => texto.replace(/-/g, "").split("").map(Number);

/** Dígito verificador del DUI: pesos 9 a 2 sobre los 8 primeros dígitos, módulo 10. */
function verificadorDui(d: number[]): number {
  const suma = d.slice(0, 8).reduce((s, n, i) => s + n * (9 - i), 0);
  return (10 - (suma % 10)) % 10;
}

/**
 * Dígito verificador del NIT de 14 dígitos. El correlativo (dígitos 11 a 13) decide la rutina:
 * hasta 100, pesos 14 a 2 y el residuo módulo 11; después de 100, pesos 2,7,6,5,4,3 repetidos y 11 − residuo.
 */
function verificadorNit(d: number[]): number {
  const correlativo = d[10]! * 100 + d[11]! * 10 + d[12]!;
  if (correlativo <= 100) {
    const suma = d.slice(0, 13).reduce((s, n, i) => s + n * (14 - i), 0);
    return (suma % 11) % 10;
  }
  const PESOS = [2, 7, 6, 5, 4, 3];
  const suma = d.slice(0, 13).reduce((s, n, i) => s + n * PESOS[i % 6]!, 0);
  const residuo = suma % 11;
  return residuo > 1 ? 11 - residuo : 0;
}

/** DUI con formato 00000000-0 y dígito verificador correcto. */
export function esDuiValido(dui: string): boolean {
  const texto = dui.trim();
  if (!DUI.test(texto)) return false;
  const d = digitos(texto);
  return d.some((n) => n !== 0) && d[8] === verificadorDui(d);
}

/** NIT de 14 dígitos con formato 0000-000000-000-0 y dígito verificador correcto. */
export function esNitValido(nit: string): boolean {
  const texto = nit.trim();
  if (!NIT.test(texto)) return false;
  const d = digitos(texto);
  return d.some((n) => n !== 0) && d[13] === verificadorNit(d);
}

/**
 * NIT de una empresa o persona: el NIT de 14 dígitos o, para personas naturales, el DUI
 * (homologado como NIT desde el 17 de diciembre de 2021).
 */
export function esNitODuiValido(valor: string): boolean {
  return esNitValido(valor) || esDuiValido(valor);
}

/**
 * NRC (registro de contribuyente de IVA): de 1 a 8 dígitos, guion y un dígito verificador.
 * Hacienda no publica el algoritmo del verificador, así que solo se valida el formato;
 * la existencia del NRC se confirma al transmitir el DTE.
 */
export function esNrcValido(nrc: string): boolean {
  const texto = nrc.trim();
  return NRC.test(texto) && /[1-9]/.test(texto);
}

/** Da formato a un NIT o DUI escrito sin guiones; si no tiene 9 ni 14 dígitos lo devuelve sin cambios. */
export function formatearNit(valor: string): string {
  const d = valor.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(d)) return valor.trim();
  if (d.length === 9) return `${d.slice(0, 8)}-${d.slice(8)}`;
  if (d.length === 14) return `${d.slice(0, 4)}-${d.slice(4, 10)}-${d.slice(10, 13)}-${d.slice(13)}`;
  return valor.trim();
}

/** Da formato a un NRC escrito sin guion: el último dígito es el verificador. */
export function formatearNrc(valor: string): string {
  const d = valor.replace(/[\s-]/g, "");
  if (!/^\d{2,9}$/.test(d)) return valor.trim();
  return `${d.slice(0, -1)}-${d.slice(-1)}`;
}
