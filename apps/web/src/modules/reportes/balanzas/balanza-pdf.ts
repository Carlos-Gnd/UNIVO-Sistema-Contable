import type { Balanza } from "@contable/shared";
import { formatearFecha, formatearDinero } from "@/lib/formato";
import { TEXTOS_BALANZAS as T } from "./textos";
import type { DatosBalanzaExportacion } from "./balanza-excel";

/** Abre una vista clara para imprimir la balanza o guardarla como PDF. */
export function imprimirBalanza(balanza: Balanza, datos: DatosBalanzaExportacion): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;

  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(crearDocumentoBalanza(balanza, datos));
  ventana.document.close();
  ventana.addEventListener(
    "load",
    () => {
      ventana.setTimeout(() => {
        ventana.focus();
        ventana.print();
      }, 200);
    },
    { once: true },
  );
  return true;
}

/** Construye el documento de impresión con las filas y filtros de la balanza consultada. */
export function crearDocumentoBalanza(balanza: Balanza, datos: DatosBalanzaExportacion): string {
  const filas = balanza.lineas
    .map(
      (linea) => `<tr>
        <td class="cuenta"><span class="codigo">${escapar(linea.codigo)}</span> ${escapar(linea.nombre)}${linea.saldoContrario ? `<span class="alerta"> · ${escapar(T.saldoContrario)}</span>` : ""}</td>
        <td class="monto">${importe(linea.saldoInicialDebe)}</td><td class="monto">${importe(linea.saldoInicialHaber)}</td>
        <td class="monto">${importe(linea.movimientoDebe)}</td><td class="monto">${importe(linea.movimientoHaber)}</td>
        <td class="monto">${importe(linea.saldoFinalDebe)}</td><td class="monto">${importe(linea.saldoFinalHaber)}</td>
      </tr>`,
    )
    .join("");
  const periodo = T.exportacion.periodo(
    formatearFecha(balanza.desde),
    formatearFecha(balanza.hasta),
    datos.alcance,
  );

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(T.exportacion.tituloDocumento(balanza.titulo))}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:24px;color:#18181b;background:#fff;font:12px Arial,Helvetica,sans-serif}
  header{border-bottom:1px solid #d4d4d8;padding-bottom:14px;margin-bottom:14px}.empresa{text-transform:uppercase;letter-spacing:.08em;font-size:9px;color:#52525b}
  h1{font-size:20px;margin:6px 0}.meta{font-size:11px;color:#52525b;margin:4px 0}.estado{font-weight:700;color:${balanza.cuadra ? "#166534" : "#b91c1c"}}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}th,td{border-bottom:1px solid #e4e4e7;padding:8px 7px;text-align:left;vertical-align:middle}
  th{background:#f4f4f5;color:#3f3f46;font-size:9px;text-transform:uppercase;letter-spacing:.04em;text-align:center}th:first-child{text-align:left}
  th:first-child,td:first-child{width:28%}.codigo{font-variant-numeric:tabular-nums;color:#52525b;margin-right:4px}.monto{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .alerta{color:#b91c1c;font-size:9px}.vacio{text-align:center;color:#52525b;padding:24px}.totales td{font-weight:700;border-top:1px solid #71717a;background:#fafafa}
  .diferencias{margin:14px 0 0 auto;width:min(100%,420px);border-collapse:collapse}.diferencias td:first-child{color:#52525b}
  @page{size:A4 landscape;margin:12mm}@media print{body{padding:0}tr{break-inside:avoid;page-break-inside:avoid}}
</style></head><body>
<header><div class="empresa">${escapar(datos.empresa)}</div><h1>${escapar(balanza.titulo)}</h1><p class="meta">${escapar(periodo)}</p><p class="meta estado">${escapar(balanza.cuadra ? T.exportacion.cuadra : T.exportacion.noCuadra)}</p></header>
<table><thead><tr><th rowspan="2">${T.columnas.codigo} y ${T.columnas.cuenta}</th><th colspan="2">${T.exportacion.grupos.saldoInicial}</th><th colspan="2">${T.exportacion.grupos.movimientos}</th><th colspan="2">${T.exportacion.grupos.saldoFinal}</th></tr><tr>${Array.from({ length: 3 }, () => `<th>${T.columnas.debe}</th><th>${T.columnas.haber}</th>`).join("")}</tr></thead>
<tbody>${filas || `<tr><td class="vacio" colspan="7">${escapar(T.exportacion.vacio)}</td></tr>`}
<tr class="totales"><td>${escapar(T.exportacion.totales)}</td><td class="monto">${importe(balanza.totales.saldoInicialDebe)}</td><td class="monto">${importe(balanza.totales.saldoInicialHaber)}</td><td class="monto">${importe(balanza.totales.movimientoDebe)}</td><td class="monto">${importe(balanza.totales.movimientoHaber)}</td><td class="monto">${importe(balanza.totales.saldoFinalDebe)}</td><td class="monto">${importe(balanza.totales.saldoFinalHaber)}</td></tr></tbody></table>
<table class="diferencias"><tbody><tr><td>${escapar(T.exportacion.grupos.saldoInicial)}</td><td class="monto">${importe(balanza.diferencias.saldoInicial)}</td></tr><tr><td>${escapar(T.exportacion.grupos.movimientos)}</td><td class="monto">${importe(balanza.diferencias.movimientos)}</td></tr><tr><td>${escapar(T.exportacion.grupos.saldoFinal)}</td><td class="monto">${importe(balanza.diferencias.saldoFinal)}</td></tr></tbody></table>
</body></html>`;
}

function importe(valor: string): string {
  return escapar(formatearDinero(valor, { simbolo: false }));
}

function escapar(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => {
    const entidad: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entidad[caracter] ?? caracter;
  });
}
