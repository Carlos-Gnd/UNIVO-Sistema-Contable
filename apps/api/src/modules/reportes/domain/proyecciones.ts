import { Dinero } from "@contable/shared";

export type MetodoProyeccion = "promedio-movil" | "regresion" | "holt-winters";

export interface SupuestosProyeccion {
  meses: number;
  crecimientoVentasMensual: number;
  crecimientoGastosMensual: number;
}

export interface MesHistoricoProyeccion {
  mes: string;
  ventas: string;
  gastos: string;
  flujoEfectivo: string;
  iva: string;
}

export interface ValorProyectado {
  estimado: string;
  minimo: string;
  maximo: string;
}

export interface PeriodoProyectado {
  mes: string;
  ventas: ValorProyectado;
  gastos: ValorProyectado;
  utilidad: ValorProyectado;
  flujoEfectivo: ValorProyectado;
  iva: ValorProyectado;
}

export interface ProyeccionFinanciera {
  calculadaConDatosHasta: string;
  metodo: MetodoProyeccion;
  periodos: PeriodoProyectado[];
}

export class SinHistorialProyeccionError extends Error {
  constructor() {
    super("No hay movimientos contabilizados para calcular la proyección.");
  }
}

export class ProyeccionFueraDeRangoError extends Error {
  constructor() {
    super("Los supuestos producen una proyección fuera del rango admitido.");
  }
}

interface AjusteModelo {
  predecir: (paso: number) => number;
  errores: number[];
}

const promedio = (valores: readonly number[]): number =>
  valores.length ? valores.reduce((suma, valor) => suma + valor, 0) / valores.length : 0;

const metodoPara = (cantidad: number): MetodoProyeccion =>
  cantidad >= 24 ? "holt-winters" : cantidad >= 6 ? "regresion" : "promedio-movil";

function ajustarPromedioMovil(valores: readonly number[]): AjusteModelo {
  const ventana = Math.min(3, valores.length);
  const errores = valores.slice(ventana).map((actual, i) => {
    const anterior = valores.slice(i, i + ventana);
    return actual - promedio(anterior);
  });
  return {
    predecir: () => promedio(valores.slice(-ventana)),
    errores: errores.length ? errores : valores.slice(1).map((v, i) => v - valores[i]!),
  };
}

function ajustarRegresion(valores: readonly number[]): AjusteModelo {
  const mediaX = (valores.length - 1) / 2;
  const mediaY = promedio(valores);
  const varianzaX = valores.reduce((suma, _, indice) => suma + (indice - mediaX) ** 2, 0);
  const covarianza = valores.reduce((suma, valor, indice) => suma + (indice - mediaX) * (valor - mediaY), 0);
  const pendiente = varianzaX === 0 ? 0 : covarianza / varianzaX;
  const intercepto = mediaY - pendiente * mediaX;
  return {
    predecir: (paso) => intercepto + pendiente * (valores.length - 1 + paso),
    errores: valores.map((valor, indice) => valor - (intercepto + pendiente * indice)),
  };
}

/** Holt-Winters aditivo mensual, inicializado con el primer año y suavizado con el historial restante. */
function ajustarHoltWinters(valores: readonly number[]): AjusteModelo {
  const periodo = 12;
  const primerAnio = valores.slice(0, periodo);
  const base = promedio(primerAnio);
  const estacionales = primerAnio.map((valor) => valor - base);
  const segundoAnio = valores.slice(periodo, periodo * 2);
  let nivel = base;
  let tendencia = segundoAnio.length === periodo ? (promedio(segundoAnio) - base) / periodo : 0;
  const errores: number[] = [];

  for (let indice = periodo; indice < valores.length; indice++) {
    const posicion = indice % periodo;
    const estacional = estacionales[posicion]!;
    const prediccion = nivel + tendencia + estacional;
    const actual = valores[indice]!;
    errores.push(actual - prediccion);
    const nivelAnterior = nivel;
    nivel = 0.4 * (actual - estacional) + 0.6 * (nivel + tendencia);
    tendencia = 0.2 * (nivel - nivelAnterior) + 0.8 * tendencia;
    estacionales[posicion] = 0.3 * (actual - nivel) + 0.7 * estacional;
  }

  return {
    predecir: (paso) => nivel + paso * tendencia + estacionales[(valores.length + paso - 1) % periodo]!,
    errores,
  };
}

function ajustar(valores: readonly number[], metodo: MetodoProyeccion): AjusteModelo {
  if (metodo === "holt-winters") return ajustarHoltWinters(valores);
  if (metodo === "regresion") return ajustarRegresion(valores);
  return ajustarPromedioMovil(valores);
}

function rmse(errores: readonly number[]): number {
  if (errores.length === 0) return 0;
  return Math.sqrt(promedio(errores.map((error) => error ** 2)));
}

function importe(valor: number): string {
  if (!Number.isFinite(valor) || Math.abs(valor) >= 1e12) throw new ProyeccionFueraDeRangoError();
  try {
    return Dinero.de(valor.toFixed(8)).aTexto();
  } catch {
    throw new ProyeccionFueraDeRangoError();
  }
}

function valorProyectado(estimado: number, incertidumbre: number, noNegativo = false): ValorProyectado {
  const centro = noNegativo ? Math.max(0, estimado) : estimado;
  const minimo = noNegativo ? Math.max(0, estimado - incertidumbre) : estimado - incertidumbre;
  const maximo = noNegativo ? Math.max(0, estimado + incertidumbre) : estimado + incertidumbre;
  return { estimado: importe(centro), minimo: importe(minimo), maximo: importe(maximo) };
}

function siguienteMes(mes: string, paso: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio!, numero! - 1 + paso, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const serie = (
  historial: readonly MesHistoricoProyeccion[],
  clave: keyof Omit<MesHistoricoProyeccion, "mes">,
) => historial.map((fila) => Number(Dinero.de(fila[clave]).aTexto()));

/** Calcula estimaciones y bandas aproximadas de confianza; nunca escribe partidas ni modifica el historial. */
export function calcularProyeccion(
  historial: readonly MesHistoricoProyeccion[],
  supuestos: SupuestosProyeccion,
): ProyeccionFinanciera {
  if (historial.length === 0) throw new SinHistorialProyeccionError();
  const metodo = metodoPara(historial.length);
  const ventas = ajustar(serie(historial, "ventas"), metodo);
  const gastos = ajustar(serie(historial, "gastos"), metodo);
  const flujo = ajustar(serie(historial, "flujoEfectivo"), metodo);
  const iva = ajustar(serie(historial, "iva"), metodo);
  const errorVentas = rmse(ventas.errores);
  const errorGastos = rmse(gastos.errores);
  const errorFlujo = rmse(flujo.errores);
  const errorIva = rmse(iva.errores);
  const crecimientoVentas = 1 + supuestos.crecimientoVentasMensual / 100;
  const crecimientoGastos = 1 + supuestos.crecimientoGastosMensual / 100;
  if (historial.at(-1)?.mes === undefined) throw new SinHistorialProyeccionError();

  const periodos = Array.from({ length: supuestos.meses }, (_, indice): PeriodoProyectado => {
    const paso = indice + 1;
    const factorVentas = crecimientoVentas ** paso;
    const factorGastos = crecimientoGastos ** paso;
    const incertidumbre = Math.sqrt(paso) * 1.96;
    const ventaBase = ventas.predecir(paso);
    const gastoBase = gastos.predecir(paso);
    const venta = ventaBase * factorVentas;
    const gasto = gastoBase * factorGastos;
    const montoVentas = valorProyectado(venta, errorVentas * incertidumbre * factorVentas, true);
    const montoGastos = valorProyectado(gasto, errorGastos * incertidumbre * factorGastos, true);
    const utilidad = valorProyectado(
      venta - gasto,
      (errorVentas * factorVentas + errorGastos * factorGastos) * incertidumbre,
    );
    const flujoBase = flujo.predecir(paso);
    const ivaBase = iva.predecir(paso) * factorVentas;
    return {
      mes: siguienteMes(historial.at(-1)!.mes, paso),
      ventas: montoVentas,
      gastos: montoGastos,
      utilidad,
      flujoEfectivo: valorProyectado(flujoBase, errorFlujo * incertidumbre),
      iva: valorProyectado(ivaBase, errorIva * incertidumbre * factorVentas),
    };
  });

  return {
    calculadaConDatosHasta: `${historial.at(-1)!.mes}-01`,
    metodo,
    periodos,
  };
}
