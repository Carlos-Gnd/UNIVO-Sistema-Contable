import type { LibroDiario, RenglonDiario } from "@contable/shared";
import { formatearFecha } from "@/lib/formato";
import { escaparHtml } from "./html";
import { TEXTOS_LIBRO_DIARIO_PDF as T } from "./textos";

export interface DatosImpresionLibroDiario {
  empresa: string;
  nit?: string | null;
  sucursal?: string | null;
  tipo?: string | null;
  nota?: string | null;
}

/** Abre una vista del libro diario para imprimirla o guardarla como PDF desde el navegador. */
export function imprimirLibroDiario(libro: LibroDiario, datos: DatosImpresionLibroDiario): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;

  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(crearDocumentoLibroDiario(libro, datos));
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

/** Genera una vista de impresión por folio; el navegador pagina el contenido sin recortar renglones. */
export function crearDocumentoLibroDiario(libro: LibroDiario, datos: DatosImpresionLibroDiario): string {
  const paginas = libro.paginas
    .map(
      (pagina, indice) => `
    <article class="pagina">
      <header class="cabecera">
        <div class="empresa">${escaparHtml(datos.empresa)}${datos.nit ? ` · NIT ${escaparHtml(datos.nit)}` : ""}</div>
        <div class="titulo">${T.titulo}</div>
        <div class="metadatos">
        ${T.periodo(formatearFecha(libro.desde), formatearFecha(libro.hasta))} · ${escaparHtml(datos.sucursal ?? T.consolidado)}${datos.tipo ? ` · ${escaparHtml(datos.tipo)}` : ""}${datos.nota ? ` · ${escaparHtml(datos.nota)}` : ""}
        </div>
        <div class="folio">${T.folio(pagina.folio)}</div>
      </header>

      <table>
        <thead>
          <tr><th class="fecha">${T.fecha}</th><th class="partida">${T.partida}</th><th>${T.codigoCuenta}</th><th class="monto">${T.parcial}</th><th class="monto">${T.debe}</th><th class="monto">${T.haber}</th></tr>
        </thead>
        <tbody>
          ${filaTotal(T.vienen, pagina.vienen)}
          ${pagina.renglones.map(filaRenglon).join("")}
          ${filaTotal(T.pasan, pagina.pasan)}
        </tbody>
      </table>
      <footer>${T.folio(pagina.folio)}</footer>
    </article>${indice < libro.paginas.length - 1 ? '<div class="salto-pagina"></div>' : ""}`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaparHtml(T.tituloDocumento(datos.empresa))}</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, Helvetica, sans-serif; color: #f4f4f5; background: #090909; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #090909; color: #f4f4f5; }
    .pagina { position: relative; width: min(100%, 210mm); min-height: 265mm; margin: 0 auto; padding: 16px; border: 1px solid #292929; border-radius: 12px; background: #191919; }
    .cabecera { position: relative; padding: 0 0 14px; border-bottom: 1px solid #292929; }
    .empresa { color: #888; font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; }
    .titulo { margin-top: 5px; font-size: 16pt; font-weight: 600; }
    .metadatos { margin-top: 5px; color: #aaa; font-size: 8pt; }
    .folio { position: absolute; right: 0; bottom: 14px; color: #ccc; font-size: 8pt; }
    table { width: 100%; margin-top: 0; border-collapse: collapse; table-layout: fixed; font-size: 8.5pt; }
    th, td { border-bottom: 1px solid #303030; padding: 7px 6px; vertical-align: middle; }
    th { color: #929292; font-size: 7pt; font-weight: 500; letter-spacing: .07em; text-align: left; text-transform: uppercase; }
    .fecha { width: 12%; }
    .partida { width: 9%; }
    .monto { width: 15%; text-align: right; }
    td.monto { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .renglon-partida td { padding-top: 9px; font-weight: 600; }
    .renglon-cuenta td:nth-child(3), .renglon-subcuenta td:nth-child(3) { padding-left: 20px; }
    .renglon-concepto td:nth-child(3) { color: #aaa; font-style: italic; }
    .renglon-total td { border-top: 1px solid #555; font-weight: 700; }
    .renglon-total td:first-child { text-align: right; }
    footer { margin-top: 12px; color: #999; font-size: 8pt; text-align: center; }
    .salto-pagina { break-after: page; page-break-after: always; }
    @page { size: A4 portrait; margin: 10mm; }
    @media print {
      body { padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      :root { color-scheme: light; color: #111; background: #fff; }
      body { background: #fff; color: #111; }
      .pagina { width: 100%; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: #fff; break-inside: auto; page-break-inside: auto; }
      .salto-pagina { height: 0; break-after: page; page-break-after: always; }
      th, td { border-color: #d4d4d4; }
      th, .empresa, .metadatos, .folio, footer { color: #555; }
      .renglon-concepto td:nth-child(3) { color: #444; }
      .renglon-total td { border-top-color: #777; }
      tr { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>${paginas}</body>
</html>`;
}

function filaRenglon(renglon: RenglonDiario): string {
  const esPartida = renglon.tipo === "partida";
  const concepto = esPartida
    ? escaparHtml(renglon.descripcion)
    : `${renglon.codigo ? `${escaparHtml(renglon.codigo)} ` : ""}${escaparHtml(renglon.descripcion)}`;
  return `<tr class="renglon-${renglon.tipo}">
    <td>${renglon.fecha ? formatearFecha(renglon.fecha) : ""}</td>
    <td>${esPartida && renglon.codigo ? `N.º ${escaparHtml(renglon.codigo)}` : ""}</td>
    <td>${concepto}</td>
    <td class="monto">${importe(renglon.parcial)}</td>
    <td class="monto">${importe(renglon.debe)}</td>
    <td class="monto">${importe(renglon.haber)}</td>
  </tr>`;
}

function filaTotal(etiqueta: string, totales: { debe: string; haber: string }): string {
  return `<tr class="renglon-total"><td colspan="4">${etiqueta}</td><td class="monto">${importe(totales.debe)}</td><td class="monto">${importe(totales.haber)}</td></tr>`;
}

function importe(valor: string | null): string {
  return valor === null ? "—" : escaparHtml(valor);
}
