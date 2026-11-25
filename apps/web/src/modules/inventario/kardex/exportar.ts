import type { KardexVista, LineaKardex } from "@contable/shared";
import { formatearFecha, hoyIso } from "@/lib/formato";
import { escaparHtml } from "@/modules/reportes/html";
import { costoUnitario, monto, unidades } from "./formato";
import { TEXTOS_KARDEX as T } from "./textos";

export interface EncabezadoKardex {
  empresa: string;
  sucursal: string;
}

const periodo = (k: KardexVista) =>
  `${k.desde ? formatearFecha(k.desde) : T.saldoInicial.toLowerCase()} · ${k.hasta ? formatearFecha(k.hasta) : ""}`.replace(
    / · $/,
    "",
  );

export const nombreArchivoExcel = (k: KardexVista) => `${T.exportar.archivo}-${k.codigo}.xlsx`;

const FORMATO_MONTO = '#,##0.00;(#,##0.00);"-"';
/** Los importes van como número en Excel para poder sumarse; los cálculos ya vienen exactos de la API. */
const numero = (valor: string) => Number(valor);

/** Libro de Excel con el kardex: encabezado, saldo inicial, movimientos y totales (HU-65). */
export async function crearExcelKardex(
  k: KardexVista,
  e: EncabezadoKardex,
  ahora: Date = new Date(),
): Promise<Blob> {
  const modulo = await import("exceljs");
  const ExcelJS = (modulo as unknown as { default?: typeof modulo }).default ?? modulo;
  const libro = new ExcelJS.Workbook();
  libro.created = ahora;
  const FILA_GRUPOS = 6;
  const hoja = libro.addWorksheet(T.exportar.hoja, { views: [{ state: "frozen", ySplit: FILA_GRUPOS + 1 }] });
  [12, 22, 12, 12, 14, 12, 12, 14, 12, 12, 14].forEach((ancho, i) => (hoja.getColumn(i + 1).width = ancho));

  hoja.getCell("A1").value = e.empresa;
  hoja.getCell("A1").font = { bold: true, size: 13 };
  hoja.getCell("A2").value = `${T.titulo}: ${k.codigo} ${k.nombre} (${k.unidadMedida})`;
  hoja.getCell("A2").font = { bold: true };
  hoja.getCell("A3").value = `${e.sucursal} · ${T.metodo[k.metodo]}`;
  hoja.getCell("A4").value = `${periodo(k)} · ${T.exportar.generado(formatearFecha(hoyIso(ahora)))}`;

  const grupos: [string, string, string][] = [
    ["C", "E", T.columnas.entradas],
    ["F", "H", T.columnas.salidas],
    ["I", "K", T.columnas.saldo],
  ];
  for (const [ini, fin, titulo] of grupos) {
    hoja.mergeCells(`${ini}${FILA_GRUPOS}:${fin}${FILA_GRUPOS}`);
    hoja.getCell(`${ini}${FILA_GRUPOS}`).value = titulo;
  }
  const encabezados: string[] = [T.columnas.fecha, T.columnas.referencia];
  for (let i = 0; i < 3; i++)
    encabezados.push(T.columnas.cantidad, T.columnas.costoUnitario, T.columnas.total);
  hoja.getRow(FILA_GRUPOS + 1).values = encabezados;
  for (const fila of [FILA_GRUPOS, FILA_GRUPOS + 1]) {
    hoja.getRow(fila).font = { bold: true };
    hoja.getRow(fila).alignment = { horizontal: "center" };
  }

  const saldoCeldas = (s: LineaKardex["saldo"]) => [
    numero(s.cantidad),
    numero(s.costoUnitario),
    numero(s.costoTotal),
  ];
  const inicial = hoja.addRow([
    T.saldoInicial,
    "",
    null,
    null,
    null,
    null,
    null,
    null,
    ...saldoCeldas(k.saldoInicial),
  ]);
  inicial.font = { italic: true };
  for (const l of k.lineas) {
    const d = l.entrada ?? l.salida!;
    const detalle = [numero(d.cantidad), numero(d.costoUnitario), numero(d.costoTotal)];
    hoja.addRow([
      formatearFecha(l.fecha),
      l.referencia ?? "",
      ...(l.entrada ? detalle : [null, null, null]),
      ...(l.salida ? detalle : [null, null, null]),
      ...saldoCeldas(l.saldo),
    ]);
  }
  const t = k.totales;
  const totales = hoja.addRow([
    T.totales,
    "",
    numero(t.entradaCantidad),
    null,
    numero(t.entradaTotal),
    numero(t.salidaCantidad),
    null,
    numero(t.salidaTotal),
    ...saldoCeldas(k.saldoFinal),
  ]);
  totales.font = { bold: true };

  hoja.eachRow((fila, n) => {
    if (n <= FILA_GRUPOS + 1) return;
    fila.eachCell((celda, col) => {
      if (col >= 3 && typeof celda.value === "number") {
        celda.alignment = { horizontal: "right" };
        celda.numFmt = [3, 6, 9].includes(col)
          ? "#,##0.####"
          : [4, 7, 10].includes(col)
            ? "#,##0.00##"
            : FORMATO_MONTO;
      }
    });
  });
  const buffer = await libro.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const celda = (v: string, clase = "") => `<td${clase ? ` class="${clase}"` : ""}>${escaparHtml(v)}</td>`;
const trio = (cantidad: string, unit: string, total: string) =>
  celda(unidades(cantidad), "n") + celda(costoUnitario(unit), "n") + celda(monto(total), "n");
const vacios = celda("") + celda("") + celda("");

/** Documento listo para imprimir o guardar como PDF: una hoja en fondo blanco con el kardex completo. */
export function htmlKardex(k: KardexVista, e: EncabezadoKardex): string {
  const filas = k.lineas
    .map((l) => {
      const d = l.entrada ?? l.salida!;
      const detalle = trio(d.cantidad, d.costoUnitario, d.costoTotal);
      return `<tr>${celda(formatearFecha(l.fecha))}${celda(l.referencia ?? "")}${l.entrada ? detalle : vacios}${l.salida ? detalle : vacios}${trio(l.saldo.cantidad, l.saldo.costoUnitario, l.saldo.costoTotal)}</tr>`;
    })
    .join("");
  const ini = k.saldoInicial;
  const t = k.totales;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(`${T.titulo} ${k.codigo}`)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; background: #fff; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2px; } p { margin: 2px 0; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; } th { background: #eee; }
  .n { text-align: right; font-variant-numeric: tabular-nums; } tr { break-inside: avoid; }
  .inicial td { font-style: italic; } .totales td { font-weight: 700; background: #f4f4f4; }
</style></head><body>
<p>${escaparHtml(e.empresa)}</p><h1>${escaparHtml(`${T.titulo}: ${k.codigo} ${k.nombre}`)}</h1>
<p>${escaparHtml(`${e.sucursal} · ${T.metodo[k.metodo]} · ${k.unidadMedida}`)}</p><p>${escaparHtml(periodo(k))}</p>
<table><thead>
<tr><th rowspan="2">${T.columnas.fecha}</th><th rowspan="2">${T.columnas.referencia}</th><th colspan="3">${T.columnas.entradas}</th><th colspan="3">${T.columnas.salidas}</th><th colspan="3">${T.columnas.saldo}</th></tr>
<tr>${[0, 1, 2].map(() => `<th>${T.columnas.cantidad}</th><th>${T.columnas.costoUnitario}</th><th>${T.columnas.total}</th>`).join("")}</tr>
</thead><tbody>
<tr class="inicial"><td colspan="8">${T.saldoInicial}</td>${trio(ini.cantidad, ini.costoUnitario, ini.costoTotal)}</tr>
${filas || `<tr><td colspan="11">${T.vacio}</td></tr>`}
<tr class="totales"><td colspan="2">${T.totales}</td>${celda(unidades(t.entradaCantidad), "n")}${celda("")}${celda(monto(t.entradaTotal), "n")}${celda(unidades(t.salidaCantidad), "n")}${celda("")}${celda(monto(t.salidaTotal), "n")}${trio(k.saldoFinal.cantidad, k.saldoFinal.costoUnitario, k.saldoFinal.costoTotal)}</tr>
</tbody></table><p>${T.nota}</p></body></html>`;
}
