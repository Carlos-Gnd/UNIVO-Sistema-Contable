/** Textos del layout principal (se moverán a los archivos de idioma con react-i18next, S1-T30). */
export const TEXTOS_LAYOUT = {
  marca: "Sistema Contable",
  menu: {
    etiqueta: "Menú principal",
    cargando: "Cargando menú…",
    error: "No se pudo cargar el menú. Recarga la página para intentarlo de nuevo.",
    sinEmpresa: "Registra o elige una empresa para ver el menú.",
    sinOpciones: "Tu usuario todavía no tiene opciones en esta empresa.",
  },
  grupos: {
    organizacion: "Organización",
    contabilidad: "Contabilidad",
  },
  opciones: {
    empresa: "Empresa",
    sucursales: "Sucursales",
    usuarios: "Usuarios",
    bitacora: "Bitácora",
    cuentas: "Catálogo de cuentas",
    importar: "Importar desde Excel",
    periodos: "Ejercicios y períodos",
    bandeja: "Partidas pendientes",
    nuevaPartida: "Nueva partida",
  },
} as const;
