import type { LibroDiario, RenglonDiario } from "@contable/shared";

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

/** Genera un folio por página física, con la presentación oscura de la referencia. */
export function crearDocumentoLibroDiario(libro: LibroDiario, datos: DatosImpresionLibroDiario): string {
  const paginas = libro.paginas
    .map(
      (pagina, indice) => `
    <article class="pagina">
      <header class="cabecera">
        <div class="empresa">${escapar(datos.empresa)}${datos.nit ? ` · NIT ${escapar(datos.nit)}` : ""}</div>
        <div class="titulo">Libro diario</div>
        <div class="metadatos">
          Del ${fecha(libro.desde)} al ${fecha(libro.hasta)} · ${escapar(datos.sucursal ?? "Consolidado")}${datos.tipo ? ` · ${escapar(datos.tipo)}` : ""}${datos.nota ? ` · ${escapar(datos.nota)}` : ""}
        </div>
        <div class="folio">Folio ${pagina.folio} de ${libro.paginas.length}</div>
      </header>

      <table>
        <thead>
          <tr><th class="fecha">Fecha</th><th class="partida">Partida</th><th>Código y cuenta</th><th class="monto">Parcial</th><th class="monto">Debe</th><th class="monto">Haber</th></tr>
        </thead>
        <tbody>
          ${filaTotal("Vienen", pagina.vienen)}
          ${pagina.renglones.map(filaRenglon).join("")}
          ${filaTotal("Pasan", pagina.pasan)}
        </tbody>
      </table>
      <footer>Folio ${pagina.folio} de ${libro.paginas.length}</footer>
    </article>${indice < libro.paginas.length - 1 ? '<div class="salto-pagina"></div>' : ""}`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Libro diario · ${escapar(datos.empresa)}</title>
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
    footer { position: absolute; right: 16px; bottom: 8px; left: 16px; color: #999; font-size: 8pt; text-align: center; }
    .salto-pagina { break-after: page; page-break-after: always; }
    @page { size: A4 portrait; margin: 10mm; }
    @media print {
      body { padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .pagina { width: 100%; height: 277mm; min-height: 0; margin: 0; border-radius: 0; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .salto-pagina { height: 0; }
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
    ? escapar(renglon.descripcion)
    : `${renglon.codigo ? `${escapar(renglon.codigo)} ` : ""}${escapar(renglon.descripcion)}`;
  return `<tr class="renglon-${renglon.tipo}">
    <td>${renglon.fecha ? fecha(renglon.fecha) : ""}</td>
    <td>${esPartida && renglon.codigo ? `N.º ${escapar(renglon.codigo)}` : ""}</td>
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
  return valor === null ? "—" : escapar(valor);
}

function fecha(valor: string): string {
  const partes = valor.slice(0, 10).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : escapar(valor);
}

function escapar(valor: string): string {
  return valor.replace(
    /[&<>"']/g,
    (caracter) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[caracter] ?? caracter,
  );
}
