import type { PartidaCaso } from "./cherophonex.ts";

const centavosComoTexto = (centavos: number): string =>
  `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;

/** Genera movimientos contables deterministas para los 23 meses previos al caso académico de octubre de 2026. */
export function generarHistorialDemo(): PartidaCaso[] {
  const estacionalidad = [92, 96, 100, 104, 108, 112, 108, 94, 98, 102, 118, 132];
  const partidas: PartidaCaso[] = [];
  let numero = 1;

  for (let indice = 0; indice < 23; indice++) {
    const fechaMes = new Date(Date.UTC(2024, 10 + indice, 1));
    const anio = fechaMes.getUTCFullYear();
    const mes = fechaMes.getUTCMonth();
    const factor = estacionalidad[mes]!;
    const base = 2_000_000 + ((anio * 31 + mes * 17) % 500_000);
    const ventas = Math.round((base * factor) / 100);
    const costo = Math.round((ventas * 68) / 100);
    const compra = Math.round((costo * 110) / 100);
    const gasto = Math.round((ventas * 12) / 100);
    const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-15`;
    const partida = (concepto: string, lineas: PartidaCaso["lineas"]): void => {
      partidas.push({ numero: numero++, fecha, tipo: "operacion", concepto, lineas });
    };

    partida(`Ventas de demostración ${anio}-${String(mes + 1).padStart(2, "0")}`, [
      { cuenta: "110101", debe: centavosComoTexto(ventas), haber: "0.00" },
      { cuenta: "510101", debe: "0.00", haber: centavosComoTexto(ventas) },
    ]);
    partida(`Compra de inventario ${anio}-${String(mes + 1).padStart(2, "0")}`, [
      { cuenta: "1109", debe: centavosComoTexto(compra), haber: "0.00" },
      { cuenta: "110101", debe: "0.00", haber: centavosComoTexto(compra) },
    ]);
    partida(`Costo de ventas ${anio}-${String(mes + 1).padStart(2, "0")}`, [
      { cuenta: "4104", debe: centavosComoTexto(costo), haber: "0.00" },
      { cuenta: "1109", debe: "0.00", haber: centavosComoTexto(costo) },
    ]);
    partida(`Gastos de administración ${anio}-${String(mes + 1).padStart(2, "0")}`, [
      { cuenta: "420134", debe: centavosComoTexto(gasto), haber: "0.00" },
      { cuenta: "110101", debe: "0.00", haber: centavosComoTexto(gasto) },
    ]);
  }

  return partidas;
}
