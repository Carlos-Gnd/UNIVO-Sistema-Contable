import { Dinero } from "@contable/shared";
import { descargarArchivo } from "@/lib/descargas";
import { formatearFecha } from "@/lib/formato";
import type { RazonesFinancierasVista } from "./razones-api";
import { TEXTOS_RAZONES as T } from "./textos";
import type { ActividadInventario } from "./actividad";

export interface FilaRazon {
  grupo: string;
  nombre: string;
  formula: string;
  valor: string;
  interpretacion: string;
}

export function filasRazones(
  razones: RazonesFinancierasVista,
  capitalTrabajo: string | null,
  actividad: ActividadInventario,
): FilaRazon[] {
  const porcentaje = (valor: string | null) => (valor === null ? T.sinDato : `${valor} %`);
  const veces = (valor: string | null) => (valor === null ? T.sinDato : T.veces(valor));
  const apalancamiento =
    razones.endeudamiento === null || razones.endeudamiento === "100.00"
      ? null
      : DineroPorcentaje(razones.endeudamiento);

  return [
    {
      grupo: T.liquidez,
      nombre: T.corriente,
      formula: T.corrienteFormula,
      valor: veces(razones.liquidezCorriente),
      interpretacion: T.corrienteAyuda,
    },
    {
      grupo: T.liquidez,
      nombre: T.acida,
      formula: T.acidaFormula,
      valor: veces(razones.pruebaAcida),
      interpretacion: T.acidaAyuda,
    },
    {
      grupo: T.liquidez,
      nombre: T.capitalTrabajo,
      formula: T.capitalFormula,
      valor: capitalTrabajo ?? T.sinDato,
      interpretacion: capitalTrabajo === null ? T.capitalNoDisponible : T.capitalTrabajoAyuda,
    },
    {
      grupo: T.endeudamiento,
      nombre: T.deuda,
      formula: T.deudaFormula,
      valor: porcentaje(razones.endeudamiento),
      interpretacion: T.deudaAyuda,
    },
    {
      grupo: T.endeudamiento,
      nombre: T.apalancamiento,
      formula: T.apalancamientoFormula,
      valor: veces(apalancamiento),
      interpretacion: T.apalancamientoAyuda,
    },
    {
      grupo: T.rentabilidad,
      nombre: T.margenBruto,
      formula: T.margenBrutoFormula,
      valor: porcentaje(razones.margenBruto),
      interpretacion: T.margenBrutoAyuda,
    },
    {
      grupo: T.rentabilidad,
      nombre: T.margenOperativo,
      formula: T.margenOperativoFormula,
      valor: porcentaje(razones.margenOperativo),
      interpretacion: T.margenOperativoAyuda,
    },
    {
      grupo: T.rentabilidad,
      nombre: T.margenNeto,
      formula: T.margenNetoFormula,
      valor: porcentaje(razones.margenNeto),
      interpretacion: T.margenNetoAyuda,
    },
    {
      grupo: T.rentabilidad,
      nombre: T.roa,
      formula: T.roaFormula,
      valor: porcentaje(razones.rentabilidadActivo),
      interpretacion: T.roaAyuda,
    },
    {
      grupo: T.rentabilidad,
      nombre: T.roe,
      formula: T.roeFormula,
      valor: porcentaje(razones.rentabilidadPatrimonio),
      interpretacion: T.roeAyuda,
    },
    {
      grupo: T.actividad,
      nombre: T.rotacionInventario,
      formula: T.rotacionInventarioFormula,
      valor: veces(actividad.rotacion),
      interpretacion: T.rotacionInventarioAyuda,
    },
    {
      grupo: T.actividad,
      nombre: T.diasInventario,
      formula: T.diasInventarioFormula,
      valor: actividad.dias === null ? T.sinDato : T.dias(actividad.dias),
      interpretacion: T.diasInventarioAyuda,
    },
  ];
}

function DineroPorcentaje(endeudamiento: string): string | null {
  const deuda = Dinero.de(endeudamiento);
  const capital = Dinero.de("100.00").menos(deuda);
  if (deuda.esNegativo() || capital.esCero() || capital.esNegativo()) return null;
  return deuda.dividido(capital.aTexto()).aTexto();
}

const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function crearRazonesExcel(
  razones: RazonesFinancierasVista,
  capitalTrabajo: string | null,
  actividad: ActividadInventario,
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema Contable UNIVO";
  const hoja = libro.addWorksheet(T.excelHoja, {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.columns = [{ width: 22 }, { width: 34 }, { width: 42 }, { width: 18 }, { width: 72 }];
  hoja.addRow([T.exportacion]);
  hoja.mergeCells("A1:E1");
  hoja.getCell("A1").font = { bold: true, size: 16 };
  hoja.addRow([T.fechaAl(formatearFecha(razones.hasta))]);
  hoja.mergeCells("A2:E2");
  hoja.getRow(2).font = { color: { argb: "FF71717A" }, italic: true };
  hoja.addRow([T.grupo, T.razon, T.formula, T.valor, T.interpretacion]);
  hoja.getRow(3).font = { bold: true };
  hoja.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
  for (const fila of filasRazones(razones, capitalTrabajo, actividad)) {
    hoja.addRow([fila.grupo, fila.nombre, fila.formula, fila.valor, fila.interpretacion]);
  }
  hoja.eachRow((fila) => {
    fila.alignment = { vertical: "middle", wrapText: true };
  });
  const bytes = await libro.xlsx.writeBuffer();
  return new Blob([bytes], { type: TIPO_EXCEL });
}

export async function descargarRazonesExcel(
  razones: RazonesFinancierasVista,
  empresaId: string,
  capitalTrabajo: string | null,
  actividad: ActividadInventario,
) {
  const archivo = await crearRazonesExcel(razones, capitalTrabajo, actividad);
  const nombre = `razones-financieras-${empresaId}-${formatearFecha(razones.hasta)}.xlsx`;
  descargarArchivo(archivo, nombre);
}
