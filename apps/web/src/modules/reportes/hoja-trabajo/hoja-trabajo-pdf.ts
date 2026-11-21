import { Dinero, type HojaTrabajo, type LineaHojaTrabajo } from "@contable/shared";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { TEXTOS_HOJA_TRABAJO as T } from "./textos";
import type { DatosHojaTrabajoExportacion } from "./hoja-trabajo-excel";

const COLUMNAS = [
  "balanzaDebe",
  "balanzaHaber",
  "ajustesDebe",
  "ajustesHaber",
  "balanzaAjustadaDebe",
  "balanzaAjustadaHaber",
  "estadoResultadosDebe",
  "estadoResultadosHaber",
  "balanceGeneralDebe",
  "balanceGeneralHaber",
] as const satisfies readonly (keyof HojaTrabajo["totales"])[];

const GRUPOS = [
  T.encabezados.balanza,
  T.encabezados.ajustes,
  T.encabezados.balanzaAjustada,
  T.encabezados.estadoResultados,
  T.encabezados.balanceGeneral,
];

/** Abre la hoja de trabajo en formato imprimible para guardarla como PDF. */
export function imprimirHojaTrabajo(hojaTrabajo: HojaTrabajo, datos: DatosHojaTrabajoExportacion): boolean {
  const ventana = window.open("", "_blank");
  if (!ventana) return false;

  ventana.opener = null;
  ventana.document.open();
  ventana.document.write(crearDocumentoHojaTrabajo(hojaTrabajo, datos));
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

/** Genera la hoja de impresión con diez columnas, sumas, diferencias y resultado del período. */
export function crearDocumentoHojaTrabajo(
  hojaTrabajo: HojaTrabajo,
  datos: DatosHojaTrabajoExportacion,
): string {
  const filas = hojaTrabajo.lineas.map((linea) => filaCuenta(linea)).join("");
  const nota = avisoResultado(hojaTrabajo);
  const periodo = T.exportacion.periodo(
    formatearFecha(hojaTrabajo.desde),
    formatearFecha(hojaTrabajo.hasta),
    datos.alcance,
  );
  const cabeceras = COLUMNAS.map(
    (_, indice) => `<th>${indice % 2 === 0 ? T.encabezados.debe : T.encabezados.haber}</th>`,
  ).join("");
  const diferencias = [
    [T.exportacion.diferencia.balanza, hojaTrabajo.diferencias.balanza],
    [T.exportacion.diferencia.ajustes, hojaTrabajo.diferencias.ajustes],
    [T.exportacion.diferencia.balanzaAjustada, hojaTrabajo.diferencias.balanzaAjustada],
    [T.exportacion.diferencia.estadoResultados, hojaTrabajo.diferencias.estadoResultados],
    [T.exportacion.diferencia.balanceGeneral, hojaTrabajo.diferencias.balanceGeneral],
  ] as const;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(T.titulo)} · ${escapar(datos.empresa)}</title>
<style>
  *{box-sizing:border-box}body{margin:0;padding:18px;color:#18181b;background:#fff;font:10px Arial,Helvetica,sans-serif}
  header{margin-bottom:12px;border-bottom:1px solid #d4d4d8;padding:0 0 10px}.empresa{color:#52525b;font-size:8px;letter-spacing:.08em;text-transform:uppercase}
  h1{margin:5px 0;font-size:17px}.meta{margin:3px 0;color:#52525b;font-size:9px}.aviso{margin:8px 0 0;padding:7px 9px;border-radius:6px;background:#f4f4f5;color:#3f3f46}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}th,td{border:1px solid #d4d4d8;padding:5px 4px;vertical-align:middle}
  th{background:#f4f4f5;color:#3f3f46;font-size:7px;text-align:center;text-transform:uppercase;letter-spacing:.025em}.cuenta{width:22%;text-align:left}
  td.cuenta{font-size:8px}.codigo{color:#71717a;font-variant-numeric:tabular-nums;margin-right:3px}.monto{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .resultado td{color:#52525b;font-style:italic}.totales td{font-weight:700;border-top:1.5px solid #71717a;background:#fafafa}.sumas-iguales td{font-weight:700;border-top:1.5px solid #18181b;background:#f4f4f5}
  .vacio{text-align:center;padding:18px;color:#52525b}.diferencias{width:min(100%,400px);margin:10px 0 0 auto}.diferencias td:first-child{color:#52525b}
  @page{size:A3 landscape;margin:10mm}@media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}}
</style></head><body>
<header><div class="empresa">${escapar(datos.empresa)}</div><h1>${escapar(T.titulo)}</h1><p class="meta">${escapar(periodo)}${datos.nota ? ` · ${escapar(datos.nota)}` : ""}</p><p class="aviso">${escapar(nota)}</p></header>
<table><thead><tr><th class="cuenta" rowspan="2">${T.encabezados.cuenta}</th>${GRUPOS.map((grupo) => `<th colspan="2">${escapar(grupo)}</th>`).join("")}</tr><tr>${cabeceras}</tr></thead>
<tbody>${filas || `<tr><td class="vacio" colspan="11">${escapar(T.vacia)}</td></tr>`}
${filaTotales(T.sumasIguales, hojaTrabajo.totales, "sumas-iguales")}${filaTotales(T.sumas, totalizarSinResultado(hojaTrabajo.lineas), "totales")}</tbody></table>
<table class="diferencias"><tbody>${diferencias.map(([etiqueta, monto]) => `<tr><td>${escapar(etiqueta)}</td><td class="monto">${importe(monto)}</td></tr>`).join("")}</tbody></table>
</body></html>`;
}

function filaCuenta(linea: LineaHojaTrabajo): string {
  const nombre = `${linea.codigo ? `<span class="codigo">${escapar(linea.codigo)}</span>` : ""}${escapar(linea.nombre)}`;
  return `<tr${linea.resultado ? ' class="resultado"' : ""}><td class="cuenta">${nombre}</td>${COLUMNAS.map((columna) => `<td class="monto">${importe(linea[columna])}</td>`).join("")}</tr>`;
}

function filaTotales(etiqueta: string, valores: HojaTrabajo["totales"], clase: string): string {
  return `<tr class="${clase}"><td class="cuenta">${escapar(etiqueta)}</td>${COLUMNAS.map((columna) => `<td class="monto">${importe(valores[columna])}</td>`).join("")}</tr>`;
}

function totalizarSinResultado(lineas: readonly LineaHojaTrabajo[]): HojaTrabajo["totales"] {
  const cuentas = lineas.filter((linea) => linea.resultado === null);
  return Object.fromEntries(
    COLUMNAS.map((columna) => [columna, Dinero.sumar(cuentas.map((linea) => linea[columna])).aTexto()]),
  ) as HojaTrabajo["totales"];
}

function avisoResultado(hojaTrabajo: HojaTrabajo): string {
  if (hojaTrabajo.resultado.tipo === "utilidad")
    return T.utilidad(formatearDinero(hojaTrabajo.resultado.monto));
  if (hojaTrabajo.resultado.tipo === "perdida")
    return T.perdida(formatearDinero(hojaTrabajo.resultado.monto));
  return T.exportacion.notaCuadre(hojaTrabajo.cuadra);
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
