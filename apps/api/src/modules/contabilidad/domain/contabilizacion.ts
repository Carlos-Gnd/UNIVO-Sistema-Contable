import { validarPartida, type CuentaInfo, type LineaPartida, type PartidaRechazada } from "@contable/shared";

/** Borrador bloqueado para contabilizar, con sus líneas y las cuentas que usa. */
export interface PartidaPorContabilizar {
  id: string;
  sucursalId: string;
  /** AAAA-MM-DD */
  fecha: string;
  estado: "borrador" | "contabilizada" | "anulada";
  lineas: LineaPartida[];
  cuentas: CuentaInfo[];
}

/** Lo que el usuario puede hacer en la empresa según su membresía y su rol. */
export interface AccesoEmpresa {
  puedeContabilizar: boolean;
  todasSucursales: boolean;
  sucursales: string[];
}

/** El usuario no tiene el permiso partidas.contabilizar en la empresa (por ejemplo, el auxiliar). */
export class SinPermisoError extends Error {
  constructor() {
    super("Su rol no permite contabilizar partidas en esta empresa.");
  }
}

/** La base de datos rechazó la contabilización por una regla contable (período cerrado, cuadre…). */
export class ReglaContableError extends Error {}

/**
 * Revisa si un borrador puede contabilizarse antes de pedírselo a la base de datos, para devolver un
 * motivo claro. La base vuelve a verificar las reglas al guardar. Devuelve null si puede contabilizarse.
 */
export function motivoParaNoContabilizar(
  partida: PartidaPorContabilizar,
  acceso: AccesoEmpresa,
): PartidaRechazada | null {
  const rechazo = (motivo: PartidaRechazada["motivo"], mensaje: string): PartidaRechazada => ({
    id: partida.id,
    motivo,
    mensaje,
  });

  if (partida.estado !== "borrador") {
    return rechazo("no_es_borrador", `La partida ya está ${partida.estado}.`);
  }
  if (!acceso.todasSucursales && !acceso.sucursales.includes(partida.sucursalId)) {
    return rechazo("sucursal_no_autorizada", "No tiene acceso a la sucursal de la partida.");
  }

  const v = validarPartida(partida.lineas, new Map(partida.cuentas.map((c) => [c.id, c])));
  if (v.puedeContabilizarse) return null;

  const [error] = v.errores;
  if (error) return rechazo("no_cuadra", `Línea ${error.linea + 1}: ${error.mensaje}`);
  if (!v.cuadra) {
    return rechazo(
      "no_cuadra",
      `No cuadra: debe ${v.totalDebe}, haber ${v.totalHaber}, diferencia US$ ${v.diferencia}.`,
    );
  }
  return rechazo("no_cuadra", "La partida necesita al menos dos líneas con monto.");
}
