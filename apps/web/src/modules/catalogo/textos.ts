import type { EtiquetasArbolCuentas } from "./arbol-cuentas";

export const ETIQUETAS_ARBOL_CUENTAS: EtiquetasArbolCuentas = {
  titulo: "Cuentas",
  expandirTodo: "Expandir todo",
  contraerTodo: "Contraer todo",
  buscar: "Buscar cuentas",
  marcadorBusqueda: "Buscar por código o nombre",
  codigo: "Código",
  cuenta: "Cuenta",
  estado: "Estado",
  imputable: "Imputable",
  vacio: "Esta empresa todavía no tiene cuentas en su catálogo.",
  sinResultados: "No se encontraron cuentas que coincidan con la búsqueda.",
  encabezado: "Cuenta de mayor",
  detalle: "Tipo",
  activa: "Activa",
  inactiva: "Inactiva",
  expandirCuenta: (nombre) => `Expandir ${nombre}`,
  contraerCuenta: (nombre) => `Contraer ${nombre}`,
};

export const TEXTOS_CATALOGO = {
  titulo: "Catálogo de cuentas",
  descripcion: "Consulta las cuentas de la empresa organizadas por niveles.",
  cargando: "Cargando cuentas…",
  errorCarga: "No se pudieron cargar las cuentas.",
  reintentar: "Reintentar",
};
