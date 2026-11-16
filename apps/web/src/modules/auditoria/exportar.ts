import type { EntradaBitacora, FiltrosBitacoraEntrada } from "@contable/shared";
import { POR_PAGINA_BITACORA } from "@contable/shared";
import type { TFunction } from "i18next";
import { formatearFecha, hoyIso } from "@/lib/formato";
import { pedirBitacora } from "./bitacora-api";
import type { FiltrosPantalla } from "./filtros";
import { cambiosDe, describirRegistro, formatearFechaHora } from "./presentacion";

/** Máximo de cambios por archivo: 100 páginas de la API. Más que eso no se lee en Excel y tarda en descargarse. */
export const MAXIMO_EXPORTACION = 10_000;

/** La exportación pediría más cambios de los permitidos: hay que acotar los filtros. */
export class DemasiadosRegistrosError extends Error {
  constructor(readonly total: number) {
    super(
      `La bitácora tiene ${total} cambios con esos filtros; el máximo para exportar es ${MAXIMO_EXPORTACION}.`,
    );
    this.name = "DemasiadosRegistrosError";
  }
}

/**
 * Todos los cambios que cumplen los filtros, recorriendo las páginas de la API de 100 en 100.
 * La paginación de la pantalla no influye: se exporta todo lo filtrado.
 */
export async function todosLosRegistros(
  empresaId: string,
  consulta: FiltrosBitacoraEntrada,
): Promise<EntradaBitacora[]> {
  const porPagina = POR_PAGINA_BITACORA.maximo;
  const primera = await pedirBitacora(empresaId, { ...consulta, pagina: 1, porPagina });
  if (primera.total > MAXIMO_EXPORTACION) throw new DemasiadosRegistrosError(primera.total);
  const registros = [...primera.registros];
  for (let pagina = 2; pagina <= primera.paginas; pagina++) {
    const siguiente = await pedirBitacora(empresaId, { ...consulta, pagina, porPagina });
    registros.push(...siguiente.registros);
  }
  return registros;
}

/** Resumen de los filtros para el encabezado del archivo: «Partidas y períodos · Modificación · 01/11/2026 – 14/11/2026». */
export function describirFiltros(filtros: FiltrosPantalla, t: TFunction<"bitacora">): string {
  const partes = [
    filtros.modulo && t(`modulos.${filtros.modulo}`),
    filtros.accion && t(`acciones.${filtros.accion}`),
    (filtros.desde || filtros.hasta) &&
      `${filtros.desde ? formatearFecha(filtros.desde) : "…"} – ${filtros.hasta ? formatearFecha(filtros.hasta) : "…"}`,
    filtros.usuario?.nombre,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : t("exportar.sinFiltros");
}

/** Cambios de un registro en texto, uno por línea: «Estado: borrador → contabilizada». */
const cambiosEnTexto = (entrada: EntradaBitacora, t: TFunction<"bitacora">) =>
  cambiosDe(entrada, t)
    .map((c) => `${c.etiqueta}: ${c.antes} → ${c.despues}`)
    .join("\n");

const FILA_ENCABEZADO = 5;

/**
 * Libro de Excel con la bitácora (S1-T60): título, fecha de generación y filtros aplicados, y una fila por cambio
 * con encabezado fijo y autofiltro. ExcelJS se descarga solo al exportar, para no hacer más pesada la aplicación.
 */
export async function crearLibroBitacora(
  registros: readonly EntradaBitacora[],
  filtros: FiltrosPantalla,
  t: TFunction<"bitacora">,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.created = ahora;
  const hoja = libro.addWorksheet(t("exportar.hoja"), {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADO }],
  });

  hoja.getCell("A1").value = t("titulo");
  hoja.getCell("A1").font = { bold: true, size: 14 };
  hoja.getCell("A2").value = t("exportar.generado", { fecha: formatearFechaHora(ahora.toISOString()) });
  hoja.getCell("A3").value = t("exportar.filtros", { filtros: describirFiltros(filtros, t) });

  const columnas = [
    { titulo: t("columnas.fecha"), ancho: 18 },
    { titulo: t("columnas.usuario"), ancho: 26 },
    { titulo: t("exportar.correo"), ancho: 30 },
    { titulo: t("columnas.accion"), ancho: 16 },
    { titulo: t("columnas.modulo"), ancho: 24 },
    { titulo: t("columnas.registro"), ancho: 36 },
    { titulo: t("exportar.cambios"), ancho: 60 },
  ];
  columnas.forEach((columna, i) => (hoja.getColumn(i + 1).width = columna.ancho));
  const encabezado = hoja.getRow(FILA_ENCABEZADO);
  encabezado.values = columnas.map((c) => c.titulo);
  encabezado.font = { bold: true };
  encabezado.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E5E5" } };
    celda.border = { bottom: { style: "thin" } };
  });

  for (const entrada of registros) {
    const fila = hoja.addRow([
      formatearFechaHora(entrada.fecha),
      entrada.usuario?.nombre ?? t("sistema"),
      entrada.usuario?.correo ?? "",
      t(`acciones.${entrada.accion}`),
      t(`modulos.${entrada.modulo ?? "otro"}`),
      describirRegistro(entrada, t),
      cambiosEnTexto(entrada, t),
    ]);
    fila.alignment = { vertical: "top", wrapText: true };
  }

  hoja.autoFilter = {
    from: { row: FILA_ENCABEZADO, column: 1 },
    to: { row: FILA_ENCABEZADO + Math.max(registros.length, 1), column: columnas.length },
  };

  const contenido = await libro.xlsx.writeBuffer();
  return new Blob([contenido], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Nombre del archivo: bitacora-2026-11-14.xlsx */
export const nombreArchivo = (t: TFunction<"bitacora">, ahora: Date = new Date()) =>
  `${t("exportar.archivo")}-${hoyIso(ahora)}.xlsx`;

/** Descarga un archivo generado en el navegador. */
export function descargar(contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después: algunos navegadores leen la URL justo tras el clic
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
