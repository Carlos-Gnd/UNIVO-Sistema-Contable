/** Textos de la exportación a Excel de la hoja de trabajo (S2-T35). */
export const TEXTOS_EXPORTACION_HOJA_TRABAJO = {
  empresa: "Sistema Contable UNIVO",
  nombreHoja: "Hoja de trabajo",
  titulo: "Hoja de trabajo de diez columnas",
  encabezados: {
    grupoCuenta: "Cuenta",
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
  vacia: "Sin cuentas para el período seleccionado.",
  exportacion: {
    boton: "Exportar",
    opciones: "Opciones de exportación",
    excel: "Excel",
    exportando: "Preparando Excel…",
    exportado: "Hoja de trabajo exportada a Excel.",
    error: "No se pudo exportar la hoja de trabajo.",
    periodo: (desde: string, hasta: string, alcance: string) => `${desde} al ${hasta} · ${alcance}`,
    notaCuadre: (cuadra: boolean) =>
      cuadra ? "La hoja de trabajo cuadra." : "La hoja de trabajo presenta diferencias.",
    utilidad: (monto: string) =>
      `La utilidad del período es ${monto}; con ella cuadran el estado de resultados y el balance general.`,
    perdida: (monto: string) =>
      `La pérdida del período es ${monto}; con ella cuadran el estado de resultados y el balance general.`,
    archivo: "hoja-trabajo",
    formatoNumero: "#,##0.00;[Red](#,##0.00);–",
    diferencia: {
      balanza: "Diferencia en balanza de comprobación",
      ajustes: "Diferencia en ajustes",
      balanzaAjustada: "Diferencia en balanza ajustada",
      estadoResultados: "Diferencia en estado de resultados",
      balanceGeneral: "Diferencia en balance general",
    },
  },
} as const;
