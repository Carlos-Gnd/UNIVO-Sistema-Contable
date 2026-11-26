/** Textos del estado de resultados (HU-37, S2-T43). */
export const TEXTOS_ESTADO_RESULTADOS = {
  descripcion: "Ventas, costos, gastos, impuesto y utilidad del período, por sucursal o consolidado.",
  concepto: "Concepto",
  monto: "US$",
  total: (seccion: string) => `Total ${seccion.toLowerCase()}`,
  nota: "Muestra los movimientos del período de la balanza ajustada, sin las partidas de cierre. Una pérdida se muestra entre paréntesis.",
  enDolares: "En dólares de EE. UU.",
} as const;
