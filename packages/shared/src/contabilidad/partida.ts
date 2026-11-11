import { Dinero, type Monto } from "../dinero/dinero";

/** Una línea del detalle de una partida. Exactamente uno de debe o haber debe ser mayor que cero. */
export interface LineaPartida {
  cuentaId: string;
  debe: Monto;
  haber: Monto;
  concepto?: string;
}

/** Datos de la cuenta que se necesitan para validar una línea. */
export interface CuentaInfo {
  id: string;
  codigo: string;
  activa: boolean;
  /** true si es de último nivel (no tiene subcuentas) y por tanto acepta movimientos */
  imputable: boolean;
}

export type CodigoErrorLinea =
  | "MONTO_NEGATIVO"
  | "DEBE_Y_HABER"
  | "SIN_MONTO"
  | "CUENTA_INEXISTENTE"
  | "CUENTA_INACTIVA"
  | "CUENTA_NO_IMPUTABLE";

export interface ErrorLinea {
  linea: number;
  codigo: CodigoErrorLinea;
  mensaje: string;
}

export interface ResultadoValidacion {
  totalDebe: string;
  totalHaber: string;
  /** Valor absoluto de debe − haber */
  diferencia: string;
  cuadra: boolean;
  /** Errores de captura; una partida con errores no se puede guardar ni contabilizar */
  errores: ErrorLinea[];
  /** Sin errores, al menos dos líneas, total mayor que cero y debe = haber */
  puedeContabilizarse: boolean;
}

const MENSAJES: Record<CodigoErrorLinea, string> = {
  MONTO_NEGATIVO: "Los montos no pueden ser negativos.",
  DEBE_Y_HABER: "Una línea no puede tener debe y haber a la vez.",
  SIN_MONTO: "La línea no tiene monto en el debe ni en el haber.",
  CUENTA_INEXISTENTE: "La cuenta no existe en el catálogo de la empresa.",
  CUENTA_INACTIVA: "La cuenta está inactiva.",
  CUENTA_NO_IMPUTABLE: "Solo se registran movimientos en cuentas de último nivel.",
};

/**
 * Valida una partida antes de guardarla o contabilizarla.
 * Una partida descuadrada sin errores de captura puede guardarse como borrador (regla del docente),
 * pero solo se contabiliza cuando debe = haber. La base de datos vuelve a verificar estas reglas.
 */
export function validarPartida(
  lineas: LineaPartida[],
  cuentas: ReadonlyMap<string, CuentaInfo>,
): ResultadoValidacion {
  const errores: ErrorLinea[] = [];
  const error = (linea: number, codigo: CodigoErrorLinea) =>
    errores.push({ linea, codigo, mensaje: MENSAJES[codigo] });

  lineas.forEach((l, i) => {
    const debe = Dinero.de(l.debe);
    const haber = Dinero.de(l.haber);
    if (debe.esNegativo() || haber.esNegativo()) error(i, "MONTO_NEGATIVO");
    else if (!debe.esCero() && !haber.esCero()) error(i, "DEBE_Y_HABER");
    else if (debe.esCero() && haber.esCero()) error(i, "SIN_MONTO");

    const cuenta = cuentas.get(l.cuentaId);
    if (!cuenta) error(i, "CUENTA_INEXISTENTE");
    else if (!cuenta.imputable) error(i, "CUENTA_NO_IMPUTABLE");
    else if (!cuenta.activa) error(i, "CUENTA_INACTIVA");
  });

  const totalDebe = Dinero.sumar(lineas.map((l) => l.debe));
  const totalHaber = Dinero.sumar(lineas.map((l) => l.haber));
  const cuadra = totalDebe.igualA(totalHaber);

  return {
    totalDebe: totalDebe.aTexto(),
    totalHaber: totalHaber.aTexto(),
    diferencia: totalDebe.menos(totalHaber).abs().aTexto(),
    cuadra,
    errores,
    puedeContabilizarse: errores.length === 0 && lineas.length >= 2 && cuadra && totalDebe.mayorQue(0),
  };
}
