import type { TipoBalanza } from "@contable/shared";

/** Textos de las balanzas de comprobación (HU-30, S2-T30). */
export const TEXTOS_BALANZAS = {
  titulo: "Balanzas de comprobación",
  descripcion: "Saldos deudores y acreedores por cuenta; deben sumar lo mismo.",
  tipos: "Tipo de balanza",
  tipo: {
    "antes-ajustes": {
      nombre: "Antes de ajustes",
      detalle: "Saldos de las operaciones del período, sin ajustes.",
    },
    ajustada: {
      nombre: "Ajustada",
      detalle: "Incluye los ajustes del período y la provisión del impuesto sobre la renta.",
    },
    "posterior-cierre": {
      nombre: "Posterior al cierre",
      detalle: "Solo cuentas de balance, ya liquidadas las de resultado.",
    },
  } satisfies Record<TipoBalanza, { nombre: string; detalle: string }>,
  columnas: {
    codigo: "Código",
    cuenta: "Cuenta",
    saldoInicial: "Saldo inicial",
    movimientos: "Movimientos",
    saldoFinal: "Saldo final",
    debe: "Debe",
    haber: "Haber",
    totales: "Totales",
  },
  saldoContrario: "Saldo contrario a su naturaleza",
  vacio: "Sin movimientos en el período.",
  cuadre: {
    etiqueta: "Debe y haber",
    saldoInicial: "Los saldos iniciales",
    movimientos: "Los movimientos",
    saldoFinal: "Los saldos finales",
  },
} as const;
