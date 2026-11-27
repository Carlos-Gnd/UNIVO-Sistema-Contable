import { Dinero, type BalanceGeneral, type EstadoResultados } from "@contable/shared";

export interface ActividadInventario {
  rotacion: string | null;
  dias: string | null;
}

function inventarioNeto(balance: BalanceGeneral): Dinero {
  return Dinero.sumar(
    balance.activoCorriente.renglones
      .filter((renglon) => renglon.codigo === "1109" || renglon.codigo === "1110")
      .map((renglon) => renglon.monto),
  );
}

/** Calcula rotación del período y días de inventario con el inventario neto promedio. */
export function calcularActividadInventario(
  estado: EstadoResultados,
  inventarioInicial: BalanceGeneral,
  inventarioFinal: BalanceGeneral,
): ActividadInventario {
  const promedio = inventarioNeto(inventarioInicial).mas(inventarioNeto(inventarioFinal)).dividido("2.00");
  const costoVentas = Dinero.de(estado.costoVentas.total).abs();
  if (promedio.esCero() || promedio.esNegativo() || costoVentas.esCero()) {
    return { rotacion: null, dias: null };
  }
  const rotacion = costoVentas.dividido(promedio.aTexto());
  if (rotacion.esCero()) return { rotacion: null, dias: null };
  const [anio, mes] = estado.hasta.slice(0, 7).split("-").map(Number) as [number, number];
  const diasDelPeriodo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return {
    rotacion: rotacion.aTexto(),
    dias: Dinero.de(String(diasDelPeriodo)).dividido(rotacion.aTexto()).aTexto(),
  };
}
