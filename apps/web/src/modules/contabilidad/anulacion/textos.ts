/** Textos de la anulación de partidas (HU-24, S2-T13). */
export const TEXTOS_ANULACION = {
  anular: "Anular",
  titulo: (numero: number) => `¿Anular la partida n.º ${numero}?`,
  descripcion:
    "Se registra una partida de reversión que invierte el debe y el haber. La original queda marcada como anulada y ninguna se elimina.",
  motivo: "Motivo de la anulación",
  motivoEjemplo: "Ej. Se registró con la cuenta equivocada",
  motivoAyuda: "Queda en la partida anulada y en la bitácora.",
  fecha: "Fecha de la reversión",
  fechaAyuda: (desde: string) => `No puede ser anterior al ${desde}. El período debe estar abierto.`,
  cancelar: "Cancelar",
  confirmar: "Anular partida",
  anulando: "Anulando…",
  exito: (original: number, reversion: number) =>
    `Partida n.º ${original} anulada con la reversión n.º ${reversion}`,
} as const;
