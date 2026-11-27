import {
  DIAS_DE_ALERTA,
  OBLIGACIONES,
  REGLAS,
  diasEntre,
  estadoDeVencimiento,
  fechaDeVencimiento,
  mesesDelRango,
  nombreDeMes,
  type Obligacion,
  type Vencimiento,
} from "@contable/shared";

export const PERMISO_VER_CALENDARIO = "declaraciones.ver";
export const PERMISO_MARCAR_PRESENTADA = "declaraciones.generar";

/** Fecha de hoy (AAAA-MM-DD) en El Salvador, que no depende de la zona horaria del servidor. */
export const hoyEnElSalvador = (ahora: Date = new Date()) =>
  ahora.toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });

/** Constancia de una obligación presentada. */
export interface Presentacion {
  obligacion: Obligacion;
  /** AAAA-MM */
  periodo: string;
  presentadaEn: string;
  nota: string | null;
}

export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}
export class SinPermisoCalendarioError extends Error {
  constructor() {
    super("Su rol no permite esta operación en el calendario tributario.");
  }
}

const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

/** Todas las obligaciones de un período, con su fecha, estado y días restantes a la fecha `hoy`. */
export function vencimientosDelPeriodo(
  periodo: string,
  presentaciones: ReadonlyMap<string, Presentacion>,
  hoy: string,
): Vencimiento[] {
  return OBLIGACIONES.map((obligacion) => {
    const regla = REGLAS[obligacion];
    const fecha = fechaDeVencimiento(obligacion, periodo);
    const presentacion = presentaciones.get(`${obligacion}:${periodo}`);
    return {
      obligacion,
      periodo,
      titulo: `${regla.nombre} · ${nombreDeMes(periodo)}`,
      tipo: regla.tipo,
      fecha,
      estado: estadoDeVencimiento(fecha, presentacion !== undefined, hoy),
      diasRestantes: diasEntre(hoy, fecha),
      presentadaEn: presentacion?.presentadaEn ?? null,
      nota: presentacion?.nota ?? null,
    };
  });
}

/**
 * Vencimientos cuya fecha cae entre `desde` y `hasta`. Cada período vence el mes siguiente: se arman los de los
 * meses que podrían caer en el rango y luego se recorta por la fecha real.
 */
export function vencimientosEnRango(
  desde: string,
  hasta: string,
  presentaciones: ReadonlyMap<string, Presentacion>,
  hoy: string,
): Vencimiento[] {
  return mesesDelRango(mesAnterior(desde.slice(0, 7)), mesAnterior(hasta.slice(0, 7)))
    .flatMap((periodo) => vencimientosDelPeriodo(periodo, presentaciones, hoy))
    .filter((v) => v.fecha >= desde && v.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.obligacion.localeCompare(b.obligacion));
}

/** Períodos que se revisan hacia atrás para avisar vencimientos sin presentar. */
export const MESES_ATRAS_EN_ALERTAS = 3;

/** Los vencimientos sin presentar que vencen en cinco días o menos, o que ya vencieron (de los últimos meses). */
export function alertasDeVencimientos(
  presentaciones: ReadonlyMap<string, Presentacion>,
  hoy: string,
): Vencimiento[] {
  const periodoActual = hoy.slice(0, 7);
  let desde = periodoActual;
  for (let i = 0; i < MESES_ATRAS_EN_ALERTAS; i++) desde = mesAnterior(desde);
  return mesesDelRango(desde, periodoActual)
    .flatMap((periodo) => vencimientosDelPeriodo(periodo, presentaciones, hoy))
    .filter((v) => v.estado === "proxima" || v.estado === "vencida")
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.obligacion.localeCompare(b.obligacion));
}

export { DIAS_DE_ALERTA };
