import type { FormatoEstados, MetodoValuacion, ModoNumeracion, SistemaInventario } from "@contable/shared";

export const TEXTOS_PARAMETROS = {
  titulo: "Parámetros de la empresa",
  descripcion: "lo que afecta cálculos se bloquea cuando ya hay movimientos",
  empresa: "Empresa",
  cargando: "Cargando parámetros…",
  secciones: {
    partidas: { titulo: "Partidas", descripcion: "Cómo se numeran al contabilizarse" },
    estados: { titulo: "Estados financieros", descripcion: "Formato en que se presentan" },
    inventario: { titulo: "Inventario", descripcion: "Valuación y sistema por defecto" },
  },
  guardado: "Parámetros guardados",
  soloLectura: "No tienes permiso para modificar los parámetros de esta empresa.",
  conMovimientos:
    "Esta empresa ya tiene partidas. La numeración, el método de valuación y el sistema de inventario no se pueden cambiar.",
  bloqueado: "Bloqueado: ya hay movimientos",
  errorCarga: "No se pudieron cargar los parámetros de la empresa.",
  reintentar: "Reintentar",
  errorGuardar: "No se pudieron guardar los parámetros.",
  campos: {
    modoNumeracion: "Numeración de partidas",
    formatoEstados: "Formato de los estados financieros",
    metodoValuacion: "Método de valuación",
    sistemaInventario: "Sistema",
  },
  acciones: {
    guardar: "Guardar parámetros",
    guardando: "Guardando…",
  },
} as const;

export const ETIQUETA_MODO_NUMERACION: Record<ModoNumeracion, string> = {
  anual: "Por ejercicio",
  mensual: "Por mes",
  por_tipo: "Por tipo",
};

export const TEXTO_AYUDA_NUMERACION: Record<ModoNumeracion, string> = {
  anual: "Un solo correlativo para todo el ejercicio.",
  mensual: "La numeración se reinicia cada mes.",
  por_tipo: "Cada tipo de partida mantiene su propio correlativo.",
};

export const ETIQUETA_FORMATO_ESTADOS: Record<FormatoEstados, string> = {
  clase: "De clase",
  niif_pymes: "NIIF para las PYMES",
};

export const ETIQUETA_METODO_VALUACION: Record<MetodoValuacion, string> = {
  promedio_ponderado: "Costo promedio",
  peps: "PEPS",
};

export const ETIQUETA_SISTEMA_INVENTARIO: Record<SistemaInventario, string> = {
  perpetuo: "Perpetuo",
  analitico: "Analítico",
};
