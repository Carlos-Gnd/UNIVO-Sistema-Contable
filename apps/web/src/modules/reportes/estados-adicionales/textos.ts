/** Textos de los estados adicionales: cambios en el patrimonio y comparativos (HU-40 y HU-43). */
export const TEXTOS_ESTADOS_ADICIONALES = {
  titulo: "Patrimonio y comparativos",
  descripcion: "Estado de cambios en el patrimonio y comparación entre períodos.",
  pestanas: "Estados adicionales",
  patrimonio: {
    pestana: "Cambios en el patrimonio",
    concepto: "Concepto",
    total: "Total patrimonio",
    enDolares: "En dólares de EE. UU.",
    periodo: (desde: string, hasta: string) => `Del ${desde} al ${hasta}`,
    coincide: (monto: string) => `Coincide con el patrimonio del balance general: ${monto}.`,
    nota: "Parte de la balanza ajustada: el resultado del período y los retiros se muestran como movimientos del patrimonio, no como partidas de cierre. Los retiros restan.",
    notaSociedad:
      "La reserva legal se separa de las utilidades al constituirse; el resto de los cargos a las utilidades se muestra como retiros o dividendos.",
    nombreArchivo: "estado-cambios-patrimonio",
  },
} as const;
