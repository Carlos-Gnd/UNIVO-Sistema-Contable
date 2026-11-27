/** Total en letras del resumen del DTE (campo totalLetras): «CIENTO TRECE 50/100 DÓLARES». */

const UNIDADES = [
  "",
  "UN",
  "DOS",
  "TRES",
  "CUATRO",
  "CINCO",
  "SEIS",
  "SIETE",
  "OCHO",
  "NUEVE",
  "DIEZ",
  "ONCE",
  "DOCE",
  "TRECE",
  "CATORCE",
  "QUINCE",
  "DIECISÉIS",
  "DIECISIETE",
  "DIECIOCHO",
  "DIECINUEVE",
  "VEINTE",
  "VEINTIÚN",
  "VEINTIDÓS",
  "VEINTITRÉS",
  "VEINTICUATRO",
  "VEINTICINCO",
  "VEINTISÉIS",
  "VEINTISIETE",
  "VEINTIOCHO",
  "VEINTINUEVE",
];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "",
  "CIENTO",
  "DOSCIENTOS",
  "TRESCIENTOS",
  "CUATROCIENTOS",
  "QUINIENTOS",
  "SEISCIENTOS",
  "SETECIENTOS",
  "OCHOCIENTOS",
  "NOVECIENTOS",
];

/** 0 a 999 en letras ("" para 0). */
function hastaMil(n: number): string {
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const d = Math.floor(resto / 10);
  const u = resto % 10;
  const decenas = resto < 30 ? UNIDADES[resto]! : u === 0 ? DECENAS[d]! : `${DECENAS[d]} Y ${UNIDADES[u]}`;
  return [CENTENAS[c], decenas].filter(Boolean).join(" ");
}

/** Entero no negativo en letras, con «UN» apocopado (VEINTIÚN, UN MILLÓN). */
export function enteroEnLetras(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("El monto no es un entero válido.");
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : `${enteroEnLetras(millones)} MILLONES`);
  }
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${hastaMil(miles)} MIL`);
  if (resto > 0) partes.push(hastaMil(resto));
  return partes.join(" ");
}

/** Monto con dos decimales («113.50») en letras para el DTE. */
export function totalEnLetras(monto: string): string {
  const [entero = "0", decimales = ""] = monto.trim().replace(/^-/, "").split(".");
  const centavos = `${decimales}00`.slice(0, 2);
  return `${enteroEnLetras(Number(entero))} ${centavos}/100 DÓLARES`;
}
