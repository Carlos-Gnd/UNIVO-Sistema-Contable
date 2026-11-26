import { formatearDinero } from "@/lib/formato";
import { escaparHtml } from "../html";
import type { DocumentoEstado, EncabezadoDocumento, FirmasDocumento } from "./documento-estado";
import { TEXTOS_EXPORTACION as T } from "./textos";

const ESTILOS = `@page{size:letter;margin:18mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#18181b;margin:0}header{text-align:center;border-bottom:1px solid #d4d4d8;padding-bottom:16px;margin-bottom:14px}h1{font-size:20px;margin:6px 0}p{margin:4px 0;color:#52525b}.marca{display:inline-grid;place-items:center;border-radius:10px;background:#18181b;color:#fff;width:32px;height:32px;font-weight:bold}.logo{max-height:48px;max-width:160px}table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border-bottom:1px solid #e4e4e7}th{text-align:left;color:#71717a;text-transform:uppercase;font-size:10px}td:not(:first-child),th:not(:first-child){text-align:right}.seccion{font-weight:bold;background:#f4f4f5}td.parrafo{text-align:left!important;white-space:pre-line;color:#3f3f46;line-height:1.5}.anexo{break-before:page}.anexo h2{font-size:16px;margin:0 0 4px}.total,.resultado{font-weight:bold;border-top:1px solid #a1a1aa}.firmas{display:flex;gap:32px;margin-top:48px;break-inside:avoid}.firmas div{flex:1;text-align:center;padding-top:8px;border-top:1px solid #52525b}.firmas span,.firmas small{display:block}.firmas small{color:#71717a;margin-top:4px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;

/** Iniciales de la empresa para la marca cuando no hay logotipo. */
const iniciales = (empresa: string) =>
  empresa
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "EQ";

/** La tabla del estado: cabecera, filas con sus montos y párrafos de texto que ocupan todo el ancho. */
function tablaHtml(documento: DocumentoEstado): string {
  const cabeceras = [T.concepto, ...documento.columnas.map((c) => c.titulo)]
    .map((c) => `<th>${escaparHtml(c)}</th>`)
    .join("");
  const filas = documento.filas
    .map((fila) => {
      if (fila.tipo === "parrafo") {
        return `<tr><td class="parrafo" colspan="${documento.columnas.length + 1}">${escaparHtml(fila.texto)}</td></tr>`;
      }
      const celdas = documento.columnas
        .map((columna, i) => {
          const valor = fila.valores?.[i];
          if (valor === undefined) return "<td></td>";
          const texto = columna.tipo === "dinero" ? formatearDinero(valor, { simbolo: false }) : valor;
          return `<td>${escaparHtml(texto)}</td>`;
        })
        .join("");
      return `<tr class="${fila.tipo}"><td>${escaparHtml(fila.texto)}</td>${celdas}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${cabeceras}</tr></thead><tbody>${filas}</tbody></table>`;
}

/** Documento imprimible para que el navegador lo guarde como PDF, con todos los textos escapados. */
export function crearDocumentoPdf(
  documento: DocumentoEstado,
  encabezado: EncabezadoDocumento,
  firmas: FirmasDocumento,
  anexo?: DocumentoEstado,
): string {
  const tabla = tablaHtml(documento);
  const bloqueAnexo = anexo
    ? `<section class="anexo"><h2>${escaparHtml(anexo.titulo)}</h2><p>${escaparHtml(anexo.periodo)}</p>${tablaHtml(anexo)}</section>`
    : "";
  const marca = encabezado.logoUrl
    ? `<img class="logo" src="${escaparHtml(encabezado.logoUrl)}" alt="">`
    : `<span class="marca">${escaparHtml(iniciales(encabezado.empresa))}</span>`;
  const nit = encabezado.nit ? `<p>NIT ${escaparHtml(encabezado.nit)}</p>` : "";
  const registro = firmas.registroContador.trim()
    ? `<small>${escaparHtml(T.inscripcion(firmas.registroContador.trim()))}</small>`
    : "";
  const bloqueFirmas = firmas.incluir
    ? `<section class="firmas"><div><span>${escaparHtml(firmas.propietario)}</span><small>${escaparHtml(T.representante)}</small></div><div><span>${escaparHtml(firmas.contador)}</span><small>${escaparHtml(T.contador)}</small>${registro}</div></section>`
    : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(documento.titulo)}</title><style>${ESTILOS}</style></head><body><header>${marca}<p>${escaparHtml(encabezado.empresa)}</p>${nit}<h1>${escaparHtml(documento.titulo)}</h1><p>${escaparHtml(T.periodo(documento.periodo, encabezado.alcance))}</p><p>${escaparHtml(T.moneda)}</p></header>${tabla}${bloqueAnexo}${bloqueFirmas}</body></html>`;
}

/** Abre una ventana y llama a imprimir cuando carga el documento; false si el navegador la bloqueó. */
export function imprimirDocumento(html: string): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;
  ventana.addEventListener("load", () => ventana.print(), { once: true });
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
  return true;
}
