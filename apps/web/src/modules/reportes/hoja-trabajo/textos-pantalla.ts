/** Textos de la pantalla de la hoja de trabajo de diez columnas (HU-31, S2-T34). */
export const TEXTOS_HOJA_TRABAJO = {
  titulo: "Hoja de trabajo",
  descripcion:
    "Diez columnas: comprobación, ajustes, balanza ajustada, estado de resultados y balance general.",
  tituloReporte: "Hoja de trabajo de diez columnas",
  columnas: {
    cuenta: "Código y cuenta",
    balanza: "Balanza de comprobación",
    ajustes: "Ajustes",
    balanzaAjustada: "Balanza ajustada",
    estadoResultados: "Estado de resultados",
    balanceGeneral: "Balance general",
    debe: "Debe",
    haber: "Haber",
  },
  sumas: "Sumas",
  sumasIguales: "Sumas iguales",
  vacio: "Sin cuentas con movimientos en el período.",
  cuadre: {
    etiqueta: "Las diez columnas",
    balanza: "Los totales de la balanza de comprobación",
    ajustes: "Los totales de los ajustes",
    balanzaAjustada: "Los totales de la balanza ajustada",
    estadoResultados: "Los totales del estado de resultados",
    balanceGeneral: "Los totales del balance general",
  },
  utilidad: (monto: string) =>
    `La utilidad del período es ${monto}; con ella cuadran el estado de resultados y el balance general.`,
  perdida: (monto: string) =>
    `La pérdida del período es ${monto}; con ella cuadran el estado de resultados y el balance general.`,
  nota: "Desliza hacia los lados: la columna de la cuenta queda fija. La utilidad se suma al lado menor del estado de resultados y se lleva al balance general.",
} as const;
