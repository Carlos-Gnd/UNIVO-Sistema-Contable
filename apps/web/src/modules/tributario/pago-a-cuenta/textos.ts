export const TEXTOS_PAGO_A_CUENTA = {
  titulo: "Pago a cuenta y retenciones · F-14",
  descripcion:
    "El pago a cuenta del 1.75 % (Art. 151 del Código Tributario) se calcula sobre los ingresos brutos del mes (ventas y otros ingresos, menos devoluciones y rebajas) y las retenciones salen de la planilla y de los servicios registrados.",
  mes: "Mes",
  cargando: "Calculando el F-14…",
  errorCarga: "No se pudo calcular el F-14.",
  reintentar: "Reintentar",
  sinEmpresa: "Selecciona una empresa para consultar el F-14.",
  nota: "Las cifras salen de las partidas contabilizadas del mes; los borradores no cuentan.",
  filas: {
    ingresos: "Ingresos brutos del mes",
    pago: (tasa: string) => `Pago a cuenta del impuesto sobre la renta (${tasa} %)`,
    planilla: "Retenciones de renta a empleados (de la planilla)",
    servicios: "Retenciones de renta por servicios",
    total: "Total a enterar con el F-14",
  },
  columnas: { concepto: "Concepto", monto: "US$" },
  estados: {
    sinPartida: "Sin partida",
    borrador: "Partida en borrador",
    contabilizada: (numero: number | null) =>
      numero === null ? "Partida contabilizada" : `Partida contabilizada n.º ${numero}`,
    anulada: "Partida anulada",
    presentada: "Presentada",
  },
  avisos: {
    desactualizada:
      "Las cifras del mes cambiaron después de generar la partida. Anúlala y genérala de nuevo para que el pago a cuenta coincida con los libros.",
    periodoCerrado: "El período contable de este mes está cerrado: no se puede generar la partida.",
    sinIngresos: "Este mes no tiene ingresos contabilizados, así que no hay pago a cuenta que determinar.",
    borradorPendiente:
      "Contabiliza la partida para que el cierre anual la acredite al calcular el impuesto sobre la renta.",
    anuladaPendiente: "La partida fue anulada: puedes generarla de nuevo con las cifras vigentes.",
  },
  acciones: {
    generar: "Generar partida de pago a cuenta",
    generando: "Generando…",
    presentar: "Marcar como presentada",
    presentando: "Marcando…",
  },
  confirmacion: {
    titulo: "Generar la partida del pago a cuenta",
    descripcion: (mes: string, fecha: string) =>
      `Se crea en ${mes} con fecha ${fecha} como partida de ajuste, en borrador. Revísala y contabilízala desde Partidas.`,
    cuenta: "Cuenta",
    debe: "Debe",
    haber: "Haber",
    total: "Total",
    cancelar: "Cancelar",
    confirmar: "Confirmar y generar",
  },
  exito: {
    generada: "Partida del pago a cuenta generada en borrador.",
    presentada: "F-14 marcado como presentado.",
  },
} as const;
