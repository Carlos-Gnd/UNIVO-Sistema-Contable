import { TRAMOS_ANTIGUEDAD, type AntiguedadSaldos } from "@contable/shared";
import { descargarArchivo } from "@/lib/descargas";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { escaparHtml } from "@/modules/reportes/html";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";
import { TEXTOS_ANTIGUEDAD as T } from "./textos";

const TIPO_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface DatosExportacionAntiguedad {
  empresa: string;
}

const nombreArchivo = (r: AntiguedadSaldos, extension: string) =>
  `${T.exportar.archivo}-${r.operacion === "venta" ? "clientes" : "proveedores"}-${r.alFecha}.${extension}`;

/** Genera el Excel de la antigüedad de saldos: un renglón por cliente o proveedor con sus tramos. */
export async function crearAntiguedadExcel(
  r: AntiguedadSaldos,
  datos: DatosExportacionAntiguedad,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.creator = "Sistema Contable UNIVO";
  libro.created = ahora;
  const hoja = libro.addWorksheet(T.exportar.hoja, {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  hoja.mergeCells("A1:G1");
  hoja.getCell("A1").value = datos.empresa;
  hoja.getCell("A1").font = { bold: true, size: 16 };
  hoja.mergeCells("A2:G2");
  hoja.getCell("A2").value = T.titulo(r.operacion);
  hoja.getCell("A2").font = { bold: true, size: 13 };
  hoja.mergeCells("A3:G3");
  hoja.getCell("A3").value = T.alFecha(formatearFecha(r.alFecha));
  hoja.getCell("A3").font = { size: 10, color: { argb: "FF52525B" } };
  hoja.columns = [{ width: 40 }, ...Array.from({ length: 6 }, () => ({ width: 16 }))];
  const encabezado = hoja.getRow(5);
  encabezado.values = [T.tercero[r.operacion], ...TRAMOS_ANTIGUEDAD.map((t) => T.tramos[t]), T.total];
  encabezado.font = { bold: true };
  encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
  for (const f of r.filas) {
    hoja.addRow([
      f.tercero.nombre,
      ...TRAMOS_ANTIGUEDAD.map((t) => aNumeroExcel(f.tramos[t])),
      aNumeroExcel(f.total),
    ]);
  }
  const totales = hoja.addRow([
    T.totales,
    ...TRAMOS_ANTIGUEDAD.map((t) => aNumeroExcel(r.totales[t])),
    aNumeroExcel(r.totales.total),
  ]);
  totales.font = { bold: true };
  totales.border = { top: { style: "thin", color: { argb: "FF71717A" } } };
  hoja.eachRow((fila, n) => {
    if (n <= 5) return;
    fila.eachCell((celda, columna) => {
      if (columna > 1) {
        celda.alignment = { horizontal: "right" };
        // number solo representa celdas numéricas de Excel; los montos del dominio siguen siendo texto decimal
        celda.numFmt = T.exportar.formatoNumero;
      }
    });
  });
  const contenido = await libro.xlsx.writeBuffer();
  return new Blob([contenido], { type: TIPO_EXCEL });
}

export function descargarAntiguedadExcel(contenido: Blob, r: AntiguedadSaldos): void {
  descargarArchivo(contenido, nombreArchivo(r, "xlsx"));
}

/** Documento HTML para imprimir la antigüedad de saldos o guardarla como PDF, con el detalle por documento. */
export function crearDocumentoAntiguedad(r: AntiguedadSaldos, datos: DatosExportacionAntiguedad): string {
  const e = escaparHtml;
  const m = (v: string) => e(formatearDinero(v, { simbolo: false }));
  const filas = r.filas
    .map(
      (f) =>
        `<tr class="tercero"><td>${e(f.tercero.nombre)}</td>${TRAMOS_ANTIGUEDAD.map((t) => `<td class="monto">${m(f.tramos[t])}</td>`).join("")}<td class="monto">${m(f.total)}</td></tr>` +
        f.documentos
          .map(
            (d) =>
              `<tr class="doc"><td>${e(d.numeroDocumento)} · ${e(T.exportar.vence)} ${e(formatearFecha(d.fechaVencimiento))} · ${d.diasVencido > 0 ? `${d.diasVencido} ${e(T.exportar.diasVencido.toLowerCase())}` : "—"}</td>${TRAMOS_ANTIGUEDAD.map((t) => `<td class="monto">${d.tramo === t ? m(d.saldo) : ""}</td>`).join("")}<td class="monto">${m(d.saldo)}</td></tr>`,
          )
          .join(""),
    )
    .join("");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(T.titulo(r.operacion))}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:24px;color:#18181b;background:#fff;font:12px Arial,Helvetica,sans-serif}
  header{border-bottom:1px solid #d4d4d8;padding-bottom:14px;margin-bottom:14px}.empresa{text-transform:uppercase;letter-spacing:.08em;font-size:9px;color:#52525b}
  h1{font-size:20px;margin:6px 0}.meta{font-size:11px;color:#52525b;margin:4px 0}
  table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #e4e4e7;padding:7px;text-align:left}
  th{background:#f4f4f5;color:#3f3f46;font-size:9px;text-transform:uppercase;text-align:right}th:first-child{text-align:left}
  .monto{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.tercero td{font-weight:700;background:#fafafa}.doc td{color:#52525b}
  .totales td{font-weight:700;border-top:1px solid #71717a}.cuadre{margin-top:12px;font-size:11px;color:${r.cuadre.cuadra ? "#166534" : "#b91c1c"}}
  @page{size:A4 landscape;margin:12mm}@media print{body{padding:0}tr{break-inside:avoid}}
</style></head><body>
<header><div class="empresa">${e(datos.empresa)}</div><h1>${e(T.titulo(r.operacion))}</h1><p class="meta">${e(T.alFecha(formatearFecha(r.alFecha)))}</p></header>
<table><thead><tr><th>${e(T.tercero[r.operacion])}</th>${TRAMOS_ANTIGUEDAD.map((t) => `<th>${e(T.tramos[t])}</th>`).join("")}<th>${e(T.total)}</th></tr></thead>
<tbody>${filas || `<tr><td colspan="7">${e(T.vacio[r.operacion])}</td></tr>`}
<tr class="totales"><td>${e(T.totales)}</td>${TRAMOS_ANTIGUEDAD.map((t) => `<td class="monto">${m(r.totales[t])}</td>`).join("")}<td class="monto">${m(r.totales.total)}</td></tr></tbody></table>
<p class="cuadre">${e(r.cuadre.cuadra ? T.cuadre.cuadra(r.cuadre.cuenta) : T.cuadre.noCuadra(r.cuadre.cuenta, formatearDinero(r.cuadre.saldoMayor), formatearDinero(r.cuadre.diferencia)))}</p>
</body></html>`;
}

/** Abre la antigüedad de saldos lista para imprimir o guardar como PDF; falso si el navegador bloqueó la ventana. */
export function imprimirAntiguedad(r: AntiguedadSaldos, datos: DatosExportacionAntiguedad): boolean {
  return imprimirDocumento(crearDocumentoAntiguedad(r, datos));
}

function aNumeroExcel(valor: string): number {
  const monto = Number(valor);
  return Number.isFinite(monto) ? monto : 0;
}
