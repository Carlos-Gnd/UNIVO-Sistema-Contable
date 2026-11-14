/** Textos de la contabilización (se moverán a los archivos de idioma con react-i18next, S1-T30). */
export const TEXTOS_CONTABILIZAR = {
  contabilizar: "Contabilizar",
  contabilizando: "Contabilizando…",
  cancelar: "Cancelar",
  individual: {
    titulo: "¿Contabilizar la partida?",
    descripcion: "Pasará al libro diario con el siguiente número correlativo y ya no podrá eliminarse.",
    fechaTipo: "Fecha y tipo",
    total: "Total",
    noCuadra: "Debe y haber tienen que ser iguales y mayores que cero.",
    guardarAntes: "Guarda el borrador para contabilizarlo.",
    exito: (numero: number) => `Partida n.º ${numero} contabilizada`,
  },
  lote: {
    seleccionadas: (n: number, total: string) =>
      `${n} ${n === 1 ? "seleccionada" : "seleccionadas"} · ${total}`,
    quitarSeleccion: "Quitar selección",
    contabilizarN: (n: number) => `Contabilizar ${n}`,
    titulo: (n: number) => `¿Contabilizar ${n} ${n === 1 ? "partida" : "partidas"}?`,
    descripcion:
      "Recibirán los números correlativos en orden de fecha. Las que no cuadren se quedan en la bandeja.",
    maximo: (max: number) => `Se contabilizan como máximo ${max} partidas a la vez.`,
    exito: (n: number) => `${n} ${n === 1 ? "partida contabilizada" : "partidas contabilizadas"}`,
    rechazadasTitulo: (n: number) =>
      `${n} ${n === 1 ? "partida no se contabilizó" : "partidas no se contabilizaron"}`,
    rechazadasDescripcion: "Se quedan en la bandeja de pendientes para corregirlas.",
    entendido: "Entendido",
    sinConcepto: "Sin concepto",
  },
};
