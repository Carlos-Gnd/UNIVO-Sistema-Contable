import {
  Dinero,
  calcularProporcion,
  type BalanceGeneral,
  type EstadoResultados,
  type RazonesFinancieras,
} from "@contable/shared";

/** Calcula razones estándar sin convertir montos contables a number ni alterar los estados recibidos. */
export function calcularRazonesFinancieras(
  estado: EstadoResultados,
  balance: BalanceGeneral,
): RazonesFinancieras {
  const inventarioNeto = Dinero.sumar(
    balance.activoCorriente.renglones
      .filter((renglon) => renglon.codigo === "1109" || renglon.codigo === "1110")
      .map((renglon) => renglon.monto),
  );
  const activoRapido = Dinero.de(balance.activoCorriente.total).menos(inventarioNeto);

  return {
    desde: estado.desde,
    hasta: estado.hasta,
    sucursalId: estado.sucursalId,
    liquidezCorriente: calcularProporcion(balance.activoCorriente.total, balance.pasivoCorriente.total),
    pruebaAcida: calcularProporcion(activoRapido, balance.pasivoCorriente.total),
    endeudamiento: calcularProporcion(balance.totalPasivo, balance.totalActivo, 100),
    margenBruto: calcularProporcion(estado.utilidadBruta, estado.ventas.total, 100),
    margenOperativo: calcularProporcion(estado.utilidadOperacion, estado.ventas.total, 100),
    margenNeto: calcularProporcion(estado.utilidadNeta, estado.ventas.total, 100),
    rentabilidadActivo: calcularProporcion(estado.utilidadNeta, balance.totalActivo, 100),
    rentabilidadPatrimonio: calcularProporcion(estado.utilidadNeta, balance.patrimonio.total, 100),
  };
}
