/** Una columna de valores del estado: montos en dólares o texto (como un porcentaje). */
export interface ColumnaDocumento {
  titulo: string;
  tipo: "dinero" | "texto";
}

/** Una fila del estado: encabezado de sección, renglón, total de sección, resultado o párrafo de texto corrido. */
export interface FilaDocumento {
  id: string;
  texto: string;
  /** Un valor por columna; vacío en los encabezados de sección y en los párrafos */
  valores?: readonly string[];
  tipo: "seccion" | "renglon" | "total" | "resultado" | "parrafo";
}

/** Estado financiero listo para exportar, sin depender de cuál estado sea (resultados, balance, patrimonio…). */
export interface DocumentoEstado {
  titulo: string;
  /** Período o fecha ya formateados, por ejemplo «Del 01/11/2026 al 30/11/2026» */
  periodo: string;
  columnas: readonly ColumnaDocumento[];
  filas: readonly FilaDocumento[];
  /** Nombre de la hoja de Excel */
  nombreHoja: string;
  /** Nombre del archivo sin extensión */
  nombreArchivo: string;
}

/** Datos de la empresa y del alcance que van en el encabezado del documento. */
export interface EncabezadoDocumento {
  empresa: string;
  nit?: string | null;
  alcance: string;
  /** URL del logotipo; vacío si no se incluye */
  logoUrl: string | null;
}

export interface FirmasDocumento {
  incluir: boolean;
  propietario: string;
  contador: string;
  registroContador: string;
}
