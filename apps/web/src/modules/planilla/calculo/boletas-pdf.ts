import type { EmpleadoPlanillaVista, ResultadoCalculoPlanillaVista } from "@contable/shared";
import { escaparHtml } from "@/modules/reportes/html";
import { formatearDinero } from "@/lib/formato";

const filas = (empleado: EmpleadoPlanillaVista) =>
  [
    ["Salario base", empleado.salarioBase],
    ["Pago de horas extra", empleado.pagoHorasExtra],
    ["Descuento por ausencias", empleado.descuentoAusencia],
    ["Salario bruto", empleado.bruto],
    ["ISSS laboral", empleado.isssLaboral],
    ["AFP laboral", empleado.afpLaboral],
    ["Renta retenida", empleado.renta],
    ["Otros descuentos", empleado.otrosDescuentos],
    ["Líquido a pagar", empleado.neto],
  ] as const;

function boleta(empleado: EmpleadoPlanillaVista, periodo: string, sucursal: string): string {
  const detalle = filas(empleado)
    .map(
      ([concepto, monto]) =>
        `<tr><th scope="row">${escaparHtml(concepto)}</th><td>${escaparHtml(formatearDinero(monto))}</td></tr>`,
    )
    .join("");
  return `<section class="boleta">
    <header><p>${escaparHtml(sucursal)}</p><h1>Boleta de pago</h1><p>Período ${escaparHtml(periodo)}</p></header>
    <p class="empleado"><strong>${escaparHtml(`${empleado.nombres} ${empleado.apellidos}`)}</strong><br>${escaparHtml(empleado.puesto)}<br>DUI: ${escaparHtml(empleado.dui)}</p>
    <table><tbody>${detalle}</tbody></table>
  </section>`;
}

/** Genera una boleta o el lote completo a partir del resultado del cálculo vigente. */
export function htmlBoletasPlanilla(
  resultado: Pick<ResultadoCalculoPlanillaVista, "periodo" | "empleados">,
  sucursal: string,
  empleadoId?: string,
): string {
  const empleados = empleadoId
    ? resultado.empleados.filter((empleado) => empleado.empleadoId === empleadoId)
    : resultado.empleados;
  const contenido = empleados.map((empleado) => boleta(empleado, resultado.periodo, sucursal)).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boletas de pago ${escaparHtml(resultado.periodo)}</title>
  <style>
    *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#18181b;margin:0}.boleta{width:100%;max-width:190mm;margin:0 auto;padding:12mm;break-after:page;page-break-after:always}.boleta:last-child{break-after:auto;page-break-after:auto}header{text-align:center;border-bottom:1px solid #a1a1aa;padding-bottom:10px;margin-bottom:14px}header p,.empleado{margin:4px 0;color:#52525b}h1{font-size:20px;margin:8px 0;color:#18181b}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #e4e4e7}th{text-align:left;font-weight:normal}td{text-align:right;font-variant-numeric:tabular-nums}.boleta tr:last-child{font-weight:bold;border-top:2px solid #71717a}@page{size:letter;margin:12mm}@media print{.boleta{padding:0}}
  </style></head><body>${contenido}</body></html>`;
}
