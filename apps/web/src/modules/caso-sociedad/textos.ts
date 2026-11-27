/** Textos de la pantalla del caso de una sociedad (HU-91, S4-T41). */
export const TEXTOS_CASO_SOCIEDAD = {
  titulo: "Caso de una sociedad",
  descripcion:
    "Del resultado del ejercicio a la reserva legal, el impuesto, el cierre con su reapertura y el patrimonio de una sociedad.",
  ejercicio: "Ejercicio",
  sinEmpresa: "Selecciona una empresa para ver el caso de sociedad.",
  cargando: "Cargando el caso del ejercicio…",
  errorCarga: "No se pudo cargar el caso del ejercicio.",
  reintentar: "Reintentar",
  noEsSociedad:
    "Esta empresa es una persona natural. El caso aplica a sociedades, que provisionan la reserva legal y pagan el impuesto con una tasa fija.",
  sinCalculo: (anio: number) =>
    `Todavía no se calcula el impuesto sobre la renta del ejercicio ${anio}. Se calcula en el paso 2 del cierre del ejercicio.`,
  irACierre: "Ir al cierre del ejercicio",
  calculo: {
    titulo: "De la utilidad a la reserva legal",
    utilidadAntes: "Utilidad antes de impuesto",
    impuesto: (tasa: string | null) =>
      tasa === null ? "Impuesto sobre la renta" : `Impuesto sobre la renta (${tasa} %)`,
    utilidadDespues: "Utilidad después de impuesto",
    capital: "Capital social",
    limite: "Límite de la reserva legal (20 % del capital social)",
    reservaActual: "Reserva legal constituida",
    disponible: "Reserva legal disponible hasta el límite",
    provision: "Reserva legal del ejercicio (7 % de la utilidad después de impuesto, hasta el límite)",
  },
  cierre: {
    titulo: "Cierre y reapertura",
    cierre: "Partida de cierre",
    reapertura: "Partida de reapertura",
    sinPartida: "Todavía no se genera. Se muestra la vista previa.",
    sinVista: "Todavía no hay datos para mostrar.",
    estado: { borrador: "Borrador", contabilizada: "Contabilizada" },
    cerrado: "Ejercicio cerrado",
    abierto: "Ejercicio abierto",
  },
  patrimonio: {
    titulo: "Estado de cambios en el patrimonio",
    concepto: "Concepto",
    total: "Total",
    error: "No se pudo cargar el estado de cambios en el patrimonio.",
    final: "Patrimonio al final del ejercicio",
  },
  estados: {
    titulo: "Estados del ejercicio",
    resultados: "Estado de resultados",
    balance: "Balance general",
    patrimonio: "Estados adicionales",
  },
} as const;
