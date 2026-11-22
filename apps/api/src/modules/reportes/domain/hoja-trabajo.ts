import {
  Dinero,
  type Balanza,
  type HojaTrabajo,
  type LineaHojaTrabajo,
  type TotalesHojaTrabajo,
} from "@contable/shared";

type Columna = keyof TotalesHojaTrabajo;

const COLUMNAS: readonly Columna[] = [
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
];

const CERO = "0.00";

function sumar(lineas: readonly LineaHojaTrabajo[], columna: Columna): string {
  return Dinero.sumar(lineas.map((linea) => linea[columna])).aTexto();
}

function totalesDe(lineas: readonly LineaHojaTrabajo[]): TotalesHojaTrabajo {
  return Object.fromEntries(
    COLUMNAS.map((columna) => [columna, sumar(lineas, columna)]),
  ) as TotalesHojaTrabajo;
}

const diferencia = (debe: string, haber: string) => Dinero.de(debe).menos(haber).abs().aTexto();

function saldoNeto(debe: string, haber: string) {
  return Dinero.de(debe).menos(haber);
}

function lados(monto: ReturnType<typeof Dinero.de>) {
  return monto.esNegativo()
    ? { debe: CERO, haber: monto.abs().aTexto() }
    : { debe: monto.aTexto(), haber: CERO };
}

/**
 * Calcula las diez columnas usando los saldos previos a ajustes y ajustados del mismo período.
 * Los ingresos y costos/gastos pasan al estado de resultados; los demás tipos de cuenta al balance general.
 * La utilidad o pérdida se agrega en sentidos opuestos a esas dos secciones para cuadrarlas.
 */
export function armarHojaTrabajo(
  periodo: { desde: string; hasta: string; sucursalId: string | null },
  balanza: Balanza,
  ajustada: Balanza,
): HojaTrabajo {
  const anteriores = new Map(balanza.lineas.map((linea) => [linea.cuentaId, linea]));
  const posteriores = new Map(ajustada.lineas.map((linea) => [linea.cuentaId, linea]));
  const cuentas = new Map([...anteriores, ...posteriores]);

  const lineas: LineaHojaTrabajo[] = [...cuentas.values()]
    .sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0))
    .map((cuenta) => {
      const anterior = anteriores.get(cuenta.cuentaId);
      const posterior = posteriores.get(cuenta.cuentaId);
      const balanzaDebe = anterior?.saldoFinalDebe ?? CERO;
      const balanzaHaber = anterior?.saldoFinalHaber ?? CERO;
      const balanzaAjustadaDebe = posterior?.saldoFinalDebe ?? CERO;
      const balanzaAjustadaHaber = posterior?.saldoFinalHaber ?? CERO;
      const ajuste = lados(
        saldoNeto(balanzaAjustadaDebe, balanzaAjustadaHaber).menos(saldoNeto(balanzaDebe, balanzaHaber)),
      );
      const esResultado =
        cuenta.tipo === "ingresos" || cuenta.tipo === "costos_gastos" || cuenta.tipo === "liquidadora";
      const esOrden = cuenta.tipo === "orden";

      return {
        cuentaId: cuenta.cuentaId,
        codigo: cuenta.codigo,
        nombre: cuenta.nombre,
        tipoCuenta: cuenta.tipo,
        resultado: null,
        balanzaDebe,
        balanzaHaber,
        ajustesDebe: ajuste.debe,
        ajustesHaber: ajuste.haber,
        balanzaAjustadaDebe,
        balanzaAjustadaHaber,
        estadoResultadosDebe: esResultado ? balanzaAjustadaDebe : CERO,
        estadoResultadosHaber: esResultado ? balanzaAjustadaHaber : CERO,
        balanceGeneralDebe: esResultado || esOrden ? CERO : balanzaAjustadaDebe,
        balanceGeneralHaber: esResultado || esOrden ? CERO : balanzaAjustadaHaber,
      };
    });

  const antesDelResultado = totalesDe(lineas);
  const neto = Dinero.de(antesDelResultado.estadoResultadosHaber).menos(
    antesDelResultado.estadoResultadosDebe,
  );
  const tipoResultado = neto.esCero() ? null : neto.esNegativo() ? "perdida" : "utilidad";
  const montoResultado = neto.abs().aTexto();

  if (tipoResultado) {
    lineas.push({
      cuentaId: null,
      codigo: "",
      nombre: tipoResultado === "utilidad" ? "Utilidad del ejercicio" : "Pérdida del ejercicio",
      tipoCuenta: null,
      resultado: tipoResultado,
      balanzaDebe: CERO,
      balanzaHaber: CERO,
      ajustesDebe: CERO,
      ajustesHaber: CERO,
      balanzaAjustadaDebe: CERO,
      balanzaAjustadaHaber: CERO,
      estadoResultadosDebe: tipoResultado === "utilidad" ? montoResultado : CERO,
      estadoResultadosHaber: tipoResultado === "perdida" ? montoResultado : CERO,
      balanceGeneralDebe: tipoResultado === "perdida" ? montoResultado : CERO,
      balanceGeneralHaber: tipoResultado === "utilidad" ? montoResultado : CERO,
    });
  }

  const totales = totalesDe(lineas);
  const diferencias = {
    balanza: diferencia(totales.balanzaDebe, totales.balanzaHaber),
    ajustes: diferencia(totales.ajustesDebe, totales.ajustesHaber),
    balanzaAjustada: diferencia(totales.balanzaAjustadaDebe, totales.balanzaAjustadaHaber),
    estadoResultados: diferencia(totales.estadoResultadosDebe, totales.estadoResultadosHaber),
    balanceGeneral: diferencia(totales.balanceGeneralDebe, totales.balanceGeneralHaber),
  };

  return {
    ...periodo,
    lineas,
    totales,
    resultado: { tipo: tipoResultado, monto: montoResultado },
    diferencias,
    cuadra: Object.values(diferencias).every((monto) => Dinero.de(monto).esCero()),
  };
}
