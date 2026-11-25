import { formatearDinero, formatearFecha } from "@/lib/formato";
import { escaparHtml as e } from "@/modules/reportes/html";
import { imprimirDocumento } from "@/modules/reportes/imprimir-documento";
import type { DatosExportacionLibro, LibroTabular } from "./libro-tabular";
import { TEXTOS_LIBROS_IVA as T } from "./textos";

/** Abre el libro de IVA en formato de impresión para guardarlo como PDF; false si el navegador bloqueó la ventana. */
export function imprimirLibroIva(libro: LibroTabular, datos: DatosExportacionLibro): boolean {
  return imprimirDocumento(crearDocumentoLibroIva(libro, datos));
}

/** Documento HTML del libro de IVA en el formato legal: encabezado del contribuyente, renglones y totales. */
export function crearDocumentoLibroIva(libro: LibroTabular, datos: DatosExportacionLibro): string {
  const periodo = T.exportacion.periodo(
    formatearFecha(libro.desde),
    formatearFecha(libro.hasta),
    datos.alcance,
  );
  const encabezado = libro.columnas.map((c) => `<th class="${c.tipo}">${e(c.titulo)}</th>`).join("");
  const celda = (clave: string, tipo: string, fila: Record<string, string | boolean>) => {
    const valor = String(fila[clave] ?? "");
    if (tipo === "monto")
      return `<td class="monto">${e(formatearDinero(valor || "0.00", { simbolo: false }))}</td>`;
    return `<td>${e(clave === "fecha" ? formatearFecha(valor) : valor)}</td>`;
  };
  const filas = libro.filas
    .map(
      (f) =>
        `<tr${f.anulado ? ' class="anulado"' : ""}>${libro.columnas.map((c) => celda(c.clave, c.tipo, f)).join("")}</tr>`,
    )
    .join("");
  const totales = libro.columnas
    .map((c, i) =>
      i === 0
        ? `<td>${e(T.totales)}</td>`
        : c.tipo === "monto"
          ? `<td class="monto">${e(formatearDinero(libro.totales[c.clave] ?? "0.00", { simbolo: false }))}</td>`
          : "<td></td>",
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(libro.titulo)}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:24px;color:#18181b;background:#fff;font:11px Arial,Helvetica,sans-serif}
  header{border-bottom:1px solid #d4d4d8;padding-bottom:12px;margin-bottom:12px}.empresa{text-transform:uppercase;letter-spacing:.08em;font-size:10px;color:#52525b}
  h1{font-size:19px;margin:6px 0}.meta{font-size:11px;color:#52525b;margin:3px 0}
  table{width:100%;border-collapse:collapse;font-size:9px}th,td{border-bottom:1px solid #e4e4e7;padding:6px 5px;text-align:left;vertical-align:middle}
  th{background:#f4f4f5;color:#3f3f46;font-size:8px;text-transform:uppercase;letter-spacing:.03em}th.monto,td.monto{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tr.anulado td{color:#71717a;text-decoration:line-through}.vacio{text-align:center;color:#52525b;padding:24px}
  tfoot td{font-weight:700;border-top:1px solid #71717a;background:#fafafa}
  @page{size:A4 landscape;margin:12mm}@media print{body{padding:0}tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}}
</style></head><body>
<header><div class="empresa">${e(datos.empresa)}${datos.nrc ? ` · NRC ${e(datos.nrc)}` : ""}</div><h1>${e(libro.titulo)}</h1><p class="meta">${e(periodo)}</p><p class="meta">${e(T.enDolares)}</p></header>
<table><thead><tr>${encabezado}</tr></thead>
<tbody>${filas || `<tr><td class="vacio" colspan="${libro.columnas.length}">${e(T.vacio)}</td></tr>`}</tbody>
${libro.filas.length > 0 ? `<tfoot><tr>${totales}</tr></tfoot>` : ""}</table>
</body></html>`;
}
