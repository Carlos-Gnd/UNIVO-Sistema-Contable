import type { EstadoResultados } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import { filasEstadoResultados } from "./filas-estado-resultados";
import { TEXTOS_ESTADO_RESULTADOS as T } from "./textos";

export interface DatosPdfEstadoResultados {
  empresa: string;
  alcance: string;
  propietario: string;
  contador: string;
  incluirFirmas: boolean;
}

/** Documento imprimible para que el navegador lo guarde como PDF, con textos escapados. */
export function crearDocumentoEstadoResultados(
  estado: EstadoResultados,
  datos: DatosPdfEstadoResultados,
): string {
  const filas = filasEstadoResultados(estado)
    .map((fila) => {
      const clase = fila.tipo;
      return `<tr class="${clase}"><td>${escaparHtml(fila.texto)}</td><td>${fila.monto === undefined ? "" : escaparHtml(fila.monto)}</td></tr>`;
    })
    .join("");
  const periodo = T.exportacion.periodo(
    formatearFecha(estado.desde),
    formatearFecha(estado.hasta),
    datos.alcance,
  );
  const firmas = datos.incluirFirmas
    ? `<section class="firmas"><div><span>${escaparHtml(datos.propietario)}</span><small>${T.exportacion.representante}</small></div><div><span>${escaparHtml(datos.contador)}</span><small>${T.exportacion.contador}</small></div></section>`
    : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(T.titulo)}</title><style>
    @page{size:letter;margin:18mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#18181b;margin:0}header{text-align:center;border-bottom:1px solid #d4d4d8;padding-bottom:16px;margin-bottom:14px}h1{font-size:20px;margin:6px 0}p{margin:4px 0;color:#52525b}.marca{display:inline-grid;place-items:center;border-radius:10px;background:#18181b;color:#fff;width:32px;height:32px;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border-bottom:1px solid #e4e4e7}th{text-align:left;color:#71717a;text-transform:uppercase;font-size:10px}td:last-child,th:last-child{text-align:right}.seccion{font-weight:bold;background:#f4f4f5}.total,.resultado{font-weight:bold;border-top:1px solid #a1a1aa}.firmas{display:flex;gap:32px;margin-top:48px;break-inside:avoid}.firmas div{flex:1;text-align:center;padding-top:8px;border-top:1px solid #52525b}.firmas span,.firmas small{display:block}.firmas small{color:#71717a;margin-top:4px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><header><span class="marca">CP</span><p>${escaparHtml(datos.empresa)}</p><h1>${escaparHtml(T.titulo)}</h1><p>${escaparHtml(periodo)}</p><p>${T.exportacion.dolares}</p></header><table><thead><tr><th>${escaparHtml(T.concepto)}</th><th>${escaparHtml(T.monto)}</th></tr></thead><tbody>${filas}</tbody></table>${firmas}</body></html>`;
}

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => {
    const entidades: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entidades[caracter] ?? caracter;
  });
}

/** Abre una ventana sin bloqueadores de contenido y llama a imprimir después de cargar el documento. */
export function imprimirEstadoResultados(documento: string): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;
  ventana.addEventListener("load", () => ventana.print(), { once: true });
  ventana.document.open();
  ventana.document.write(documento);
  ventana.document.close();
  ventana.focus();
  return true;
}
