import type { EntradaBitacora } from "@contable/shared";
import type { TFunction } from "i18next";
import { formatearFecha, hoyIso } from "@/lib/formato";

/** La bitácora muestra las horas de El Salvador, sin importar la zona del equipo. */
const ZONA = "America/El_Salvador";

const formatoFechaHora = new Intl.DateTimeFormat("es-SV", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha y hora ISO como «10/11/2026 16:42» en hora de El Salvador. */
export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const partes = Object.fromEntries(formatoFechaHora.formatToParts(fecha).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

type Datos = Record<string, unknown>;
const texto = (valor: unknown) =>
  typeof valor === "string" || typeof valor === "number" ? String(valor) : "";

/** Nombre legible del registro que cambió: «Partida n.º 7», «1101 Caja», «Casa matriz»… */
export function describirRegistro(entrada: EntradaBitacora, t: TFunction<"bitacora">): string {
  const datos: Datos = entrada.datosNuevos ?? entrada.datosAnteriores ?? {};
  switch (entrada.tabla) {
    case "partidas": {
      if (datos.numero !== null && datos.numero !== undefined)
        return t("registro.partida", { numero: texto(datos.numero) });
      const concepto = texto(datos.concepto);
      return concepto ? t("registro.borrador", { concepto }) : t("registro.borradorSinConcepto");
    }
    case "cuentas":
      return t("registro.cuenta", { codigo: texto(datos.codigo), nombre: texto(datos.nombre) });
    case "partida_detalles": {
      const concepto = texto(datos.concepto);
      return concepto ? t("registro.lineaConConcepto", { concepto }) : t("registro.linea");
    }
    case "periodos":
      return t("registro.periodo", {
        mes: texto(datos.mes).padStart(2, "0"),
        anio: texto(datos.fecha_inicio).slice(0, 4),
      });
    case "ejercicios":
      return t("registro.ejercicio", { anio: texto(datos.anio) });
    case "membresias":
      return t("registro.membresia");
    case "membresia_sucursales":
      return t("registro.membresiaSucursal");
    default:
      return texto(datos.nombre) || entrada.tabla;
  }
}

/** Columnas técnicas que no aportan al leer un cambio: identificadores internos y marcas de tiempo. */
const esTecnico = (campo: string) =>
  campo === "id" || campo.endsWith("_id") || campo === "creado_en" || campo === "actualizado_en";

const FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Valor de un campo para mostrarlo: Sí/No, fechas en formato local y «—» si no tiene valor. */
export function formatearValor(valor: unknown, t: TFunction<"bitacora">): string {
  if (valor === null || valor === undefined || valor === "") return t("valores.vacio");
  if (typeof valor === "boolean") return valor ? t("valores.si") : t("valores.no");
  if (typeof valor === "string") {
    if (FECHA_HORA.test(valor)) return formatearFechaHora(valor);
    if (FECHA.test(valor)) return formatearFecha(valor);
    return valor;
  }
  if (typeof valor === "number") return String(valor);
  return JSON.stringify(valor);
}

/** Nombre de un campo de la base («codigo_establecimiento» → «Código de establecimiento»). */
export function nombreCampo(campo: string, t: TFunction<"bitacora">): string {
  const traducido = t(`campos.${campo}` as "campos.nombre", { defaultValue: "" });
  if (traducido) return traducido;
  const legible = campo.replaceAll("_", " ");
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}

export interface CambioCampo {
  campo: string;
  etiqueta: string;
  antes: string;
  despues: string;
}

/**
 * Campos que cambiaron: en una modificación, solo los que tienen otro valor; al crear, los valores nuevos; al
 * eliminar, los que tenía. Se omiten identificadores internos y marcas de tiempo.
 */
export function cambiosDe(entrada: EntradaBitacora, t: TFunction<"bitacora">): CambioCampo[] {
  const antes: Datos = entrada.datosAnteriores ?? {};
  const despues: Datos = entrada.datosNuevos ?? {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((c) => !esTecnico(c));
  return campos
    .filter(
      (campo) =>
        entrada.accion !== "UPDATE" || JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo]),
    )
    .map((campo) => ({
      campo,
      etiqueta: nombreCampo(campo, t),
      antes: entrada.accion === "INSERT" ? t("valores.vacio") : formatearValor(antes[campo], t),
      despues: entrada.accion === "DELETE" ? t("valores.vacio") : formatearValor(despues[campo], t),
    }));
}

export type RangoFechas = "todas" | "hoy" | "semana" | "mes" | "personalizado";

/** Fechas AAAA-MM-DD de un rango rápido, contado desde hoy (incluido). */
export function fechasDeRango(
  rango: Exclude<RangoFechas, "personalizado">,
  ahora: Date = new Date(),
): { desde?: string; hasta?: string } {
  const hoy = hoyIso(ahora);
  if (rango === "todas") return {};
  if (rango === "hoy") return { desde: hoy, hasta: hoy };
  if (rango === "mes") return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  const inicio = new Date(ahora);
  inicio.setDate(inicio.getDate() - 6);
  return { desde: hoyIso(inicio), hasta: hoy };
}
