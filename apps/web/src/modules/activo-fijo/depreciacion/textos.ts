import type { EstadoDepreciacionMes } from "@contable/shared";

/** Textos de la pantalla de depreciación (HU-82, S3-T131). */
export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** «Octubre 2026» para el mes AAAA-MM (o AAAA-MM-DD). */
export const nombreDelMes = (mes: string): string =>
  `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes} ${mes.slice(0, 4)}`;

export const ESTADOS: Record<EstadoDepreciacionMes, string> = {
  pendiente: "Pendiente",
  generada: "Generada",
  bloqueada: "Faltan meses anteriores",
  terminada: "Depreciado por completo",
};

export const TEXTOS_DEPRECIACION = {
  titulo: "Depreciación",
  descripcion: "Línea recta con los porcentajes del Art. 30 de la LISR · cuadro por activo y partida del mes",
  generar: "Generar depreciación del mes",
  cargando: "Calculando la depreciación…",
  errorCarga: "No se pudo cargar la depreciación.",
  reintentar: "Reintentar",
  tarjetas: {
    costo: "Costo de los activos",
    cuota: "Cuota del mes",
    acumulada: "Depreciación acumulada",
    enLibros: "Valor en libros",
  },
  pestanas: { mes: "Mes a depreciar", cuadro: "Cuadro del activo" },
  mes: "Mes",
  estadoMes: { pendiente: "Pendiente", generada: "Partida generada", sinActivos: "Sin activos" },
  tabla: {
    codigo: "Código",
    activo: "Activo",
    costo: "Costo",
    tasa: "Tasa anual",
    cuota: "Cuota del mes",
    acumulada: "Acumulada",
    enLibros: "Valor en libros",
    estado: "Estado",
    faltaMes: (mes: string) => `Falta ${nombreDelMes(mes)}`,
  },
  vacio: "Ningún activo se deprecia en este mes.",
  vacioSinActivos: "Aún no hay activos fijos: regístralos en Activos fijos para depreciarlos.",
  articulo30: "Porcentajes máximos del Art. 30 de la LISR",
  articulo30Detalle:
    "Edificaciones 5 % · Maquinaria 20 % · Vehículos 25 % · Otros bienes muebles (mobiliario y equipo) 50 %.",
  nota: "El último mes absorbe el redondeo para que el activo quede exactamente en su valor residual.",
  cuadro: {
    activo: "Activo",
    titulo: (nombre: string) => `Cuadro de depreciación · ${nombre}`,
    resumen: (inicio: string, tasa: string, meses: number) =>
      `Inicio ${inicio} · ${tasa} % anual · ${meses} meses`,
    mes: "Mes",
    cuota: "Cuota",
    acumulada: "Depreciación acumulada",
    enLibros: "Valor en libros",
    estado: "Estado",
    generada: "Generada",
    pendiente: "Pendiente",
    sinActivos: "No hay activos para mostrar su cuadro.",
  },
  dialogo: {
    titulo: "Generar la depreciación del mes",
    descripcion: (mes: string) => `${mes} · se crea ya contabilizada. Revísala antes de confirmar.`,
    partida: (sucursal: string) => `Partida de ${sucursal}`,
    cuenta: "Cuenta",
    debe: "Debe",
    haber: "Haber",
    total: "Total",
    cancelar: "Cancelar",
    confirmar: "Confirmar y contabilizar",
    generando: "Generando…",
    exito: (mes: string, partidas: number) =>
      partidas === 1
        ? `Depreciación de ${mes} generada y contabilizada`
        : `Depreciación de ${mes} generada y contabilizada en ${partidas} partidas`,
  },
} as const;
