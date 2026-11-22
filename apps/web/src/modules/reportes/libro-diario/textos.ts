import type { TipoPartida } from "@contable/shared";

/** Textos del libro diario (HU-25, S2-T17). */
export const TEXTOS_LIBRO_DIARIO = {
  titulo: "Libro diario",
  descripcion:
    "Las partidas en orden cronológico, en el formato de clase, con folios y totales Vienen y Pasan.",
  tituloReporte: "Libro diario",
  filtros: {
    tipo: "Tipo de partida",
    todosTipos: "Todos los tipos",
    renglones: "Renglones por folio",
  },
  tipos: {
    apertura: "Apertura",
    operacion: "Operación",
    ajuste: "Ajuste",
    cierre: "Cierre",
    reapertura: "Reapertura",
    reversion: "Reversión",
  } satisfies Record<TipoPartida, string>,
  columnas: {
    fecha: "Fecha",
    codigo: "Código",
    concepto: "Concepto",
    parcial: "Parcial",
    debe: "Debe",
    haber: "Haber",
  },
  folio: (n: number) => `Folio ${n}`,
  folios: (n: number) => (n === 1 ? "1 folio" : `${n} folios`),
  partidas: (n: number) => (n === 1 ? "1 partida" : `${n} partidas`),
  vienen: "Vienen",
  pasan: "Pasan",
  totales: "Totales",
  vacio: "No hay partidas contabilizadas en el período.",
  cuadre: "Debe y haber",
} as const;
