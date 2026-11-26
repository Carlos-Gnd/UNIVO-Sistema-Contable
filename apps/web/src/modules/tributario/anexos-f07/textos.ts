/** Textos de los anexos del F-07 en CSV (HU-51). */
export const TEXTOS_ANEXOS_F07 = {
  pestana: "Anexos del F-07",
  sinPermiso: "Su rol no permite consultar los libros de IVA de los que salen los anexos.",
  cargando: "Armando los anexos…",
  errorCarga: "No se pudieron armar los anexos.",
  reintentar: "Reintentar",
  encabezado: (mes: string, anio: number) => `Declaración F-07 · ${mes} de ${anio}`,
  resumen: (debito: string, credito: string) => `Débito fiscal ${debito} · crédito fiscal ${credito}`,
  generarTodos: "Generar todos",
  generarCsv: "Generar CSV",
  registros: (n: number) => (n === 1 ? "1 registro" : `${n} registros`),
  vistaPrevia: (n: number, total: string, mostrados: number) =>
    `${n} ${n === 1 ? "registro" : "registros"} · total ${total} · vista previa de los primeros ${mostrados}`,
  sinRegistros: "El libro de este mes no tiene registros.",
  estado: {
    listos: "Listos para cargar en el portal",
    conErrores: (n: number) => `${n} ${n === 1 ? "campo obligatorio falta" : "campos obligatorios faltan"}`,
  },
  erroresTitulo: "Corrija estos datos antes de exportar",
  erroresAyuda:
    "El archivo no se genera mientras falten campos obligatorios. Corrija el documento y vuelva a abrir esta pestaña.",
  masErrores: (n: number) => `y ${n} más`,
  formato:
    "El archivo usa punto y coma como separador, punto decimal, fechas dd/mm/aaaa y no lleva encabezado, listo para cargarlo en el portal.",
  descargado: "Anexo descargado.",
  descargados: "Anexos descargados.",
  prefijoArchivo: "f07",
} as const;
