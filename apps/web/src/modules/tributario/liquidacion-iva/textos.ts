/** Textos de la liquidación del IVA (F-07), HU-48. */
export const TEXTOS_LIQUIDACION_IVA = {
  pestana: "F-07 · IVA",
  cargando: "Calculando el F-07…",
  errorCarga: "No se pudo calcular el F-07.",
  reintentar: "Reintentar",
  sinEmpresa: "Selecciona una empresa para consultar el F-07.",
  nota: "Las cifras salen de las partidas contabilizadas del mes, igual que los libros de IVA; los borradores no cuentan. El remanente se traslada solo al mes siguiente.",
  filas: {
    debitoContribuyentes: "Débito fiscal · ventas a contribuyentes",
    debitoConsumidor: "Débito fiscal · ventas a consumidor final",
    debito: "Total débito fiscal",
    credito: "(−) Crédito fiscal · libro de compras",
    percibido: "(−) IVA percibido por proveedores (1 %)",
    retenido: "(−) IVA retenido por clientes (1 %)",
    remanenteAnterior: "(−) Remanente del mes anterior",
    porPagar: "IVA por pagar",
    remanente: "Remanente de crédito para el mes siguiente",
    percibidoEfectuado: "(+) IVA percibido a clientes (1 %), por enterar",
    retenidoEfectuado: "(+) IVA retenido a proveedores (1 %), por enterar",
    totalAEnterar: "Total a enterar con el F-07",
  },
  columnas: { concepto: "Concepto", monto: "US$" },
  avisos: {
    desactualizada:
      "Las cifras del mes cambiaron después de generar la partida. Anúlala y genérala de nuevo para que la liquidación coincida con los libros.",
    periodoCerrado: "El período contable de este mes está cerrado: no se puede generar la partida.",
    sinDebito: "Este mes no tiene débito fiscal contabilizado, así que no hay IVA que liquidar.",
    borradorPendiente: "Contabiliza la partida desde Partidas antes de marcar el F-07 como presentado.",
    anuladaPendiente: "La partida fue anulada: puedes generarla de nuevo con las cifras vigentes.",
    saldoAFavor: (monto: string, siguiente: string) =>
      `El mes cierra sin IVA por pagar: queda un remanente de US$ ${monto} que se traslada a ${siguiente}.`,
    porPagar: (monto: string) => `El mes cierra con IVA por pagar de US$ ${monto}. No queda remanente.`,
  },
  acciones: {
    generar: "Generar partida de liquidación",
    generando: "Generando…",
    presentar: "Marcar como presentada",
    presentando: "Marcando…",
  },
  confirmacion: { titulo: "Generar la partida de liquidación del IVA" },
  exito: {
    generada: "Partida de liquidación generada en borrador.",
    presentada: "F-07 marcado como presentado.",
  },
} as const;
