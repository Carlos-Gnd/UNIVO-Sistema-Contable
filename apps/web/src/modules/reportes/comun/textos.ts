/** Textos compartidos por los reportes (balanzas, estados financieros…). */
export const TEXTOS_REPORTES = {
  filtros: {
    titulo: "Filtros del reporte",
    desde: "Desde",
    hasta: "Hasta",
    sucursal: "Sucursal",
    consolidado: "Consolidado",
    rangoInvalido: "La fecha inicial no puede ser posterior a la final.",
    fechaRequerida: "Escribe la fecha.",
  },
  consolidado: "Consolidado",
  cargando: "Generando el reporte…",
  error: "No se pudo generar el reporte.",
  reintentar: "Reintentar",
  sinPermiso: "Tu rol no permite consultar este reporte.",
  nota: "Incluye partidas contabilizadas y anuladas, nunca borradores.",
  cuadra: (etiqueta: string) => `${etiqueta} cuadran`,
  noCuadra: "No cuadra.",
  diferencia: (etiqueta: string, monto: string) => `${etiqueta} difieren en ${monto}.`,
  revisar: "Revisa las partidas del período antes de usar este reporte.",
} as const;
