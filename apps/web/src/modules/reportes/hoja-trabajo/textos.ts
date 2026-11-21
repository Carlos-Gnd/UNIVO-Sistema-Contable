/** Textos del reporte de hoja de trabajo y sus formatos de exportación (HU-31, S2-T31). */
export const TEXTOS_HOJA_TRABAJO = {
  titulo: "Hoja de trabajo de diez columnas",
  encabezados: {
    cuenta: "Cuenta",
    codigoCuenta: "Código y cuenta",
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
  diferencias: "Diferencias",
  vacia: "Sin cuentas para el período seleccionado.",
  utilidad: (monto: string) =>
    `La utilidad del período es ${monto}; con ella cuadran el estado de resultados y el balance general.`,
  perdida: (monto: string) =>
    `La pérdida del período es ${monto}; con ella cuadran el estado de resultados y el balance general.`,
  exportacion: {
    boton: "Exportar",
    opciones: "Opciones de exportación",
    pdf: "PDF",
    excel: "Excel",
    exportando: "Preparando Excel…",
    exportado: "Hoja de trabajo exportada a Excel.",
    error: "No se pudo exportar la hoja de trabajo.",
    errorVentanas: "Permite las ventanas emergentes para imprimir o guardar como PDF.",
    empresa: "Sistema Contable UNIVO",
    consolidado: "Consolidado",
    periodo: (desde: string, hasta: string, alcance: string) => `${desde} al ${hasta} · ${alcance}`,
    notaCuadre: (cuadra: boolean) =>
      cuadra ? "La hoja de trabajo cuadra." : "La hoja de trabajo presenta diferencias.",
    nombreHoja: "Hoja de trabajo",
    prefijoArchivo: "hoja-trabajo",
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
