import type {
  EmpleadoPlanillaOficialVista,
  ResultadoPlanillasOficialesVista,
  TipoPlanillaOficial,
} from "@contable/shared";
import { Dinero } from "@contable/shared";
import { descargarArchivo } from "@/lib/descargas";
import { formatearDinero } from "@/lib/formato";
import { escaparHtml } from "@/modules/reportes/html";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";
import { TEXTOS_PLANILLAS_OFICIALES as T } from "./textos";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function datos(tipo: TipoPlanillaOficial, empleado: EmpleadoPlanillaOficialVista) {
  const laboral = tipo === "isss" ? empleado.isssLaboral : empleado.afpLaboral;
  const patronal = tipo === "isss" ? empleado.isssPatronal : empleado.afpPatronal;
  return { laboral, patronal, total: Dinero.de(laboral).mas(patronal).aTexto() };
}

function aNumeroExcel(monto: string): number {
  // La conversión solo se usa para escribir celdas numéricas de Excel.
  const numero = Number(monto);
  return Number.isFinite(numero) ? numero : 0;
}

export async function crearExcelPlanillaOficial(
  tipo: TipoPlanillaOficial,
  planilla: ResultadoPlanillasOficialesVista,
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(
    tipo === "isss" ? T.exportacion.nombreHojaIsss : T.exportacion.nombreHojaAfp,
    { views: [{ state: "frozen", ySplit: 5 }], pageSetup: { orientation: "landscape", fitToWidth: 1 } },
  );
  hoja.columns = [
    { width: 32 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 20 },
    { width: 22 },
    { width: 18 },
  ];
  hoja.mergeCells("A1:H1");
  hoja.getCell("A1").value = T.exportacion.titulo(tipo);
  hoja.getCell("A1").font = { bold: true, size: 15 };
  hoja.mergeCells("A2:H2");
  hoja.getCell("A2").value = `Período: ${planilla.periodo}`;
  hoja.mergeCells("A3:H3");
  hoja.getCell("A3").value = T.exportacion.nota;
  const titulos = T.exportacion.encabezados;
  hoja.addRow([]);
  const encabezados = [
    titulos.empleado,
    titulos.numeroIsss,
    titulos.nup,
    titulos.dui,
    titulos.salario,
    tipo === "isss" ? titulos.laboralIsss : titulos.laboralAfp,
    tipo === "isss" ? titulos.patronalIsss : titulos.patronalAfp,
    titulos.total,
  ];
  const filaEncabezado = hoja.addRow(encabezados);
  filaEncabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  filaEncabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
  for (const empleado of planilla.empleados) {
    const importe = datos(tipo, empleado);
    hoja.addRow([
      empleado.nombreCompleto,
      empleado.numeroIsss,
      empleado.nup,
      empleado.dui,
      aNumeroExcel(empleado.salarioCotizable),
      aNumeroExcel(importe.laboral),
      aNumeroExcel(importe.patronal),
      aNumeroExcel(importe.total),
    ]);
  }
  const totales = planilla.totales[tipo];
  const filaTotal = hoja.addRow([
    T.total,
    "",
    "",
    "",
    aNumeroExcel(totales.salarioCotizable),
    aNumeroExcel(totales.laboral),
    aNumeroExcel(totales.patronal),
    aNumeroExcel(totales.total),
  ]);
  filaTotal.font = { bold: true };
  for (let columna = 5; columna <= 8; columna++) {
    hoja.getColumn(columna).numFmt = '#,##0.00;(#,##0.00);"-"';
    hoja.getColumn(columna).alignment = { horizontal: "right" };
  }
  const archivo = await libro.xlsx.writeBuffer();
  return new Blob([archivo], { type: TIPO_XLSX });
}

export function descargarExcelPlanillaOficial(
  archivo: Blob,
  tipo: TipoPlanillaOficial,
  periodo: string,
): void {
  descargarArchivo(archivo, `planilla-${tipo}-${periodo}.xlsx`);
}

const celda = (contenido: string, numero = false) =>
  `<td${numero ? ' class="numero"' : ""}>${escaparHtml(contenido)}</td>`;

export function htmlPlanillaOficial(
  tipo: TipoPlanillaOficial,
  planilla: ResultadoPlanillasOficialesVista,
): string {
  const titulos = T.exportacion.encabezados;
  const filas = planilla.empleados
    .map((empleado) => {
      const importe = datos(tipo, empleado);
      return `<tr>${celda(empleado.nombreCompleto)}${celda(empleado.numeroIsss)}${celda(empleado.nup)}${celda(empleado.dui)}${celda(formatearDinero(empleado.salarioCotizable), true)}${celda(formatearDinero(importe.laboral), true)}${celda(formatearDinero(importe.patronal), true)}${celda(formatearDinero(importe.total), true)}</tr>`;
    })
    .join("");
  const total = planilla.totales[tipo];
  const encabezados = [
    titulos.empleado,
    titulos.numeroIsss,
    titulos.nup,
    titulos.dui,
    titulos.salario,
    tipo === "isss" ? titulos.laboralIsss : titulos.laboralAfp,
    tipo === "isss" ? titulos.patronalIsss : titulos.patronalAfp,
    titulos.total,
  ]
    .map((titulo) => `<th>${escaparHtml(titulo)}</th>`)
    .join("");
  const footer = `<tr class="total"><th>${T.total}</th><td></td><td></td><td></td>${celda(formatearDinero(total.salarioCotizable), true)}${celda(formatearDinero(total.laboral), true)}${celda(formatearDinero(total.patronal), true)}${celda(formatearDinero(total.total), true)}</tr>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(T.exportacion.titulo(tipo))}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { color: #18181b; background: #fff; font: 11px Arial, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 6px; } p { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { border: 1px solid #d4d4d8; padding: 6px; text-align: left; }
  thead th { background: #f4f4f5; } .numero { text-align: right; white-space: nowrap; }
  .total { font-weight: bold; background: #f4f4f5; }
</style></head><body><h1>${escaparHtml(T.exportacion.titulo(tipo))}</h1>
<p>Período: ${escaparHtml(planilla.periodo)}</p><p>${escaparHtml(T.exportacion.nota)}</p>
<table><thead><tr>${encabezados}</tr></thead><tbody>${filas}${footer}</tbody></table></body></html>`;
}

export function imprimirPlanillaOficial(
  tipo: TipoPlanillaOficial,
  planilla: ResultadoPlanillasOficialesVista,
): boolean {
  return imprimirDocumento(htmlPlanillaOficial(tipo, planilla));
}
