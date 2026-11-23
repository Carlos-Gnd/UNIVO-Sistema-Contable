import type { LibroMayor, MovimientoLibroMayor } from "@contable/shared";
import { formatearDinero, formatearFecha, hoyIso } from "@/lib/formato";
import { TEXTOS_LIBRO_MAYOR as T } from "./textos";

/** Datos del encabezado que no trae el libro: empresa, período y sucursal ya formateados. */
export interface EncabezadoExportacion {
  empresa: string;
  periodo: string;
  alcance: string;
}

/** Con subcuentas (cuenta de mayor) se agrega la columna con la subcuenta de cada movimiento. */
export const tieneSubcuentas = (libro: LibroMayor) =>
  libro.movimientos.some((m) => m.cuentaCodigo !== libro.codigo);

const concepto = (m: MovimientoLibroMayor) => m.concepto ?? T.sinConcepto;
const subcuenta = (m: MovimientoLibroMayor) => `${m.cuentaCodigo} ${m.cuentaNombre}`;
/** Los montos van como número en Excel, para que se puedan sumar; nunca pasan por float al calcular. */
const numero = (monto: string) => Number(monto);

const FORMATO_MONTO = '#,##0.00;(#,##0.00);"-"';

/** Libro de Excel con el mayor de la cuenta (S2-T23): encabezado, saldo inicial, movimientos y totales. */
export async function crearExcelLibroMayor(
  libro: LibroMayor,
  encabezado: EncabezadoExportacion,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const archivo = new ExcelJS.Workbook();
  archivo.created = ahora;
  const conSubcuentas = tieneSubcuentas(libro);
  const columnas = [
    { titulo: T.columnas.fecha, ancho: 12 },
    { titulo: T.columnas.partida, ancho: 10 },
    { titulo: T.columnas.concepto, ancho: 44 },
    ...(conSubcuentas ? [{ titulo: T.columnas.subcuenta, ancho: 32 }] : []),
    { titulo: T.columnas.sucursal, ancho: 20 },
    { titulo: T.columnas.debe, ancho: 15 },
    { titulo: T.columnas.haber, ancho: 15 },
    { titulo: T.columnas.saldo, ancho: 15 },
  ];
  const FILA_ENCABEZADO = 6;
  const hoja = archivo.addWorksheet(T.exportar.hoja, {
    views: [{ state: "frozen", ySplit: FILA_ENCABEZADO }],
  });
  columnas.forEach((c, i) => (hoja.getColumn(i + 1).width = c.ancho));

  hoja.getCell("A1").value = encabezado.empresa;
  hoja.getCell("A1").font = { bold: true, size: 13 };
  hoja.getCell("A2").value = `${T.titulo}: ${libro.codigo} ${libro.nombre}`;
  hoja.getCell("A2").font = { bold: true };
  hoja.getCell("A3").value =
    `${encabezado.periodo} · ${encabezado.alcance} · ${T.naturaleza[libro.naturaleza]}`;
  hoja.getCell("A4").value = T.exportar.generado(formatearFecha(hoyIso(ahora)));

  const filaEncabezado = hoja.getRow(FILA_ENCABEZADO);
  filaEncabezado.values = columnas.map((c) => c.titulo);
  filaEncabezado.font = { bold: true };
  filaEncabezado.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E5E5" } };
    celda.border = { bottom: { style: "thin" } };
  });

  const vacias = (n: number) => Array.from({ length: n }, () => null);
  const antesDeMontos = columnas.length - 3;
  hoja.addRow([T.saldoInicial, ...vacias(antesDeMontos - 1), null, null, numero(libro.saldoInicial)]).font = {
    italic: true,
  };
  for (const m of libro.movimientos) {
    hoja.addRow([
      formatearFecha(m.fecha),
      m.numero,
      concepto(m),
      ...(conSubcuentas ? [subcuenta(m)] : []),
      m.sucursal,
      numero(m.debe),
      numero(m.haber),
      numero(m.saldo),
    ]);
  }
  const totales = hoja.addRow([
    T.totales,
    ...vacias(antesDeMontos - 1),
    numero(libro.totalDebe),
    numero(libro.totalHaber),
    numero(libro.saldoFinal),
  ]);
  totales.font = { bold: true };
  totales.eachCell((celda) => (celda.border = { top: { style: "thin" } }));

  for (let i = columnas.length - 2; i <= columnas.length; i++) hoja.getColumn(i).numFmt = FORMATO_MONTO;

  const contenido = await archivo.xlsx.writeBuffer();
  return new Blob([contenido], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export const nombreArchivoExcel = (libro: LibroMayor, ahora: Date = new Date()) =>
  T.exportar.archivo(libro.codigo, hoyIso(ahora));

const escapar = (texto: string) =>
  texto.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

const celdaMonto = (monto: string) =>
  `<td class="m">${escapar(formatearDinero(monto, { simbolo: false }))}</td>`;

/** Documento HTML del mayor listo para imprimir o guardar como PDF desde el navegador (S2-T23). */
export function htmlLibroMayor(libro: LibroMayor, encabezado: EncabezadoExportacion): string {
  const conSubcuentas = tieneSubcuentas(libro);
  const titulos = [
    T.columnas.fecha,
    T.columnas.partida,
    T.columnas.concepto,
    ...(conSubcuentas ? [T.columnas.subcuenta] : []),
    T.columnas.sucursal,
  ];
  const vacias = titulos.length - 1;
  const filas = libro.movimientos
    .map(
      (m) =>
        `<tr><td>${formatearFecha(m.fecha)}</td><td>${m.numero}</td><td>${escapar(concepto(m))}</td>${
          conSubcuentas ? `<td>${escapar(subcuenta(m))}</td>` : ""
        }<td>${escapar(m.sucursal)}</td>${celdaMonto(m.debe)}${celdaMonto(m.haber)}${celdaMonto(m.saldo)}</tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${escapar(`${T.titulo} ${libro.codigo}`)}</title>
<style>
  @page { size: letter landscape; margin: 14mm; }
  body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; }
  header { text-align: center; margin-bottom: 12px; }
  header p { margin: 2px 0; }
  .empresa { font-weight: bold; font-size: 12pt; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3px 6px; border-bottom: 1px solid #ccc; text-align: left; vertical-align: top; }
  th { border-bottom: 1.5px solid #000; }
  th.m, td.m { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.t td { font-weight: bold; border-top: 1.5px solid #000; border-bottom: 3px double #000; }
  tr.i td { font-style: italic; }
  thead { display: table-header-group; }
</style></head>
<body>
<header>
  <p class="empresa">${escapar(encabezado.empresa)}</p>
  <p><b>${escapar(T.titulo)}</b></p>
  <p>${escapar(`${libro.codigo} ${libro.nombre}`)} · ${escapar(T.naturaleza[libro.naturaleza])}</p>
  <p>${escapar(encabezado.periodo)} · ${escapar(encabezado.alcance)}</p>
</header>
<table>
  <thead><tr>${titulos.map((t) => `<th>${escapar(t)}</th>`).join("")}<th class="m">${T.columnas.debe}</th><th class="m">${
    T.columnas.haber
  }</th><th class="m">${T.columnas.saldo}</th></tr></thead>
  <tbody>
    <tr class="i"><td colspan="${vacias + 3}">${T.saldoInicial}</td>${celdaMonto(libro.saldoInicial)}</tr>
    ${filas}
    <tr class="t"><td colspan="${vacias + 1}">${T.totales}</td>${celdaMonto(libro.totalDebe)}${celdaMonto(
      libro.totalHaber,
    )}${celdaMonto(libro.saldoFinal)}</tr>
  </tbody>
</table>
</body></html>`;
}

/** Abre el documento en una ventana nueva y lanza la impresión; false si el navegador bloqueó la ventana. */
export function imprimirHtml(html: string): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;
  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  ventana.addEventListener("load", () => ventana.setTimeout(() => ventana.print(), 200), { once: true });
  return true;
}
