/**
 * Calendario tributario de El Salvador (HU-52): vencimientos mensuales por obligación en el día hábil que
 * corresponde. Todo son fechas AAAA-MM-DD, sin horas ni zonas horarias, calculadas en UTC.
 */

/** Obligaciones mensuales que vencen en los primeros días hábiles del mes siguiente al período. */
export const OBLIGACIONES = ["f07", "f14", "planilla"] as const;
export type Obligacion = (typeof OBLIGACIONES)[number];

export interface ReglaObligacion {
  nombre: string;
  /** Número de días hábiles del mes siguiente en que vence */
  diasHabiles: number;
  tipo: "IVA" | "Renta" | "Planilla";
}

/**
 * Plazos de cada obligación. Son constantes revisables: el F-07 (IVA) y el F-14 (pago a cuenta y retenciones)
 * vencen dentro de los primeros diez días hábiles del mes siguiente (Código Tributario), y las planillas de
 * ISSS y AFP en el mismo plazo. Si la normativa cambia, se ajustan aquí y en las pruebas.
 */
export const REGLAS: Record<Obligacion, ReglaObligacion> = {
  f07: { nombre: "F-07 IVA", diasHabiles: 10, tipo: "IVA" },
  f14: { nombre: "F-14 Pago a cuenta", diasHabiles: 10, tipo: "Renta" },
  planilla: { nombre: "Planilla ISSS y AFP", diasHabiles: 10, tipo: "Planilla" },
};

const aFecha = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** Domingo de Pascua (algoritmo gregoriano anónimo), como [mes, día]. */
function domingoDePascua(anio: number): [number, number] {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return [mes, dia];
}

const sumarDias = (fecha: string, dias: number): string => {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return aFecha(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
};

const memoria = new Map<number, ReadonlySet<string>>();

/**
 * Días de asueto del año (Código de Trabajo): 1 de enero, jueves y viernes santo, 1 y 10 de mayo, 17 de junio,
 * 3 y 6 de agosto, 15 de septiembre, 2 de noviembre y 25 de diciembre. Los asuetos extraordinarios que decrete
 * el gobierno no están aquí.
 */
export function feriados(anio: number): ReadonlySet<string> {
  const guardado = memoria.get(anio);
  if (guardado) return guardado;
  const [mesPascua, diaPascua] = domingoDePascua(anio);
  const pascua = aFecha(anio, mesPascua, diaPascua);
  const lista = new Set([
    aFecha(anio, 1, 1),
    sumarDias(pascua, -3), // jueves santo
    sumarDias(pascua, -2), // viernes santo
    aFecha(anio, 5, 1),
    aFecha(anio, 5, 10),
    aFecha(anio, 6, 17),
    aFecha(anio, 8, 3),
    aFecha(anio, 8, 6),
    aFecha(anio, 9, 15),
    aFecha(anio, 11, 2),
    aFecha(anio, 12, 25),
  ]);
  memoria.set(anio, lista);
  return lista;
}

/** Día de la semana de una fecha: 0 domingo … 6 sábado. */
export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Lunes a viernes que no es asueto. */
export function esDiaHabil(fecha: string): boolean {
  const dia = diaDeLaSemana(fecha);
  return dia !== 0 && dia !== 6 && !feriados(Number(fecha.slice(0, 4))).has(fecha);
}

/** Primer día hábil desde la fecha (ella misma si ya lo es). */
export function siguienteDiaHabil(fecha: string): string {
  let f = fecha;
  while (!esDiaHabil(f)) f = sumarDias(f, 1);
  return f;
}

/** El n-ésimo día hábil (1 = el primero) del mes dado (AAAA-MM). */
export function enesimoDiaHabil(mes: string, n: number): string {
  let f = `${mes}-01`;
  let contados = 0;
  for (;;) {
    if (esDiaHabil(f)) contados++;
    if (contados === n) return f;
    f = sumarDias(f, 1);
  }
}

/** Mes siguiente (AAAA-MM) a uno dado. */
export function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/** Diferencia en días (hasta − desde) entre dos fechas. */
export function diasEntre(desde: string, hasta: string): number {
  const n = (f: string) => {
    const [a, m, d] = f.split("-").map(Number) as [number, number, number];
    return Date.UTC(a, m - 1, d) / 86_400_000;
  };
  return n(hasta) - n(desde);
}

/** Fecha límite de una obligación del período (AAAA-MM): el n-ésimo día hábil del mes siguiente. */
export function fechaDeVencimiento(obligacion: Obligacion, periodo: string): string {
  return enesimoDiaHabil(mesSiguiente(periodo), REGLAS[obligacion].diasHabiles);
}

/** Días de anticipación con los que el tablero avisa un vencimiento (HU-52). */
export const DIAS_DE_ALERTA = 5;

export type EstadoVencimiento = "presentada" | "vencida" | "proxima" | "pendiente";

/**
 * Estado de un vencimiento al día `hoy`: presentada si ya se marcó; vencida si pasó la fecha sin presentarla;
 * próxima si faltan cinco días o menos (el mismo día cuenta); pendiente en los demás casos.
 */
export function estadoDeVencimiento(fecha: string, presentada: boolean, hoy: string): EstadoVencimiento {
  if (presentada) return "presentada";
  const dias = diasEntre(hoy, fecha);
  if (dias < 0) return "vencida";
  return dias <= DIAS_DE_ALERTA ? "proxima" : "pendiente";
}

const NOMBRES_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Nombre del mes en minúsculas para el título de un vencimiento (AAAA-MM → «octubre»). */
export const nombreDeMes = (mes: string): string => NOMBRES_MES[Number(mes.slice(5, 7)) - 1] ?? mes;

/** Períodos (AAAA-MM) de un rango de meses, ambos extremos incluidos. */
export function mesesDelRango(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  for (let m = desde; m <= hasta; m = mesSiguiente(m)) meses.push(m);
  return meses;
}
