import type { ClasificacionContribuyente, ModoNumeracion, TipoContribuyente } from "@contable/shared";

/** Textos del formulario de empresa (se moverán a los archivos de idioma con react-i18next, S1-T30). */
export const TEXTOS_EMPRESA = {
  tituloRegistrar: "Registrar empresa",
  descripcionRegistrar:
    "Quedarás como su administrador. Recibirá su casa matriz y el catálogo de cuentas según su tipo de contribuyente.",
  tituloEmpresa: "Empresa",
  descripcionEditable: "Datos fiscales que aparecen en la interfaz, los libros y los reportes.",
  descripcionSoloLectura: "Solo el administrador puede modificar estos datos.",
  datosGenerales: "Datos generales",
  datosFiscales: "Datos fiscales",
  casaMatriz: "Casa matriz",
  casaMatrizDescripcion: "Se crea junto con la empresa. Sus códigos los asigna Hacienda para los DTE.",
  campos: {
    nombre: "Razón social",
    nombreEjemplo: "Nombre legal completo",
    nombreComercial: "Nombre comercial",
    tipoContribuyente: "Tipo de contribuyente",
    tipoNoEditable: "No se cambia: define el catálogo de cuentas que se copió al registrarla.",
    nit: "NIT",
    nitSociedad: "14 dígitos: 0000-000000-000-0",
    nitNatural: "NIT de 14 dígitos o DUI homologado 00000000-0",
    nrc: "NRC",
    nrcAyuda: "Opcional · 000000-0",
    clasificacion: "Clasificación",
    clasificacionAyuda: "Define si aplica la retención o percepción del 1 %",
    actividadEconomica: "Actividad económica",
    actividadEjemplo: "Ej. 46900 · Venta al por mayor de otros productos",
    telefono: "Teléfono",
    correo: "Correo electrónico",
    correoEjemplo: "Ej: contabilidad@empresa.com",
    direccion: "Dirección",
    modoNumeracion: "Numeración de partidas",
    modoNumeracionAyuda: "Cómo se reinicia el número correlativo de las partidas contabilizadas",
    opcional: "Opcional",
    matrizNombre: "Nombre",
    matrizEstablecimiento: "Código de establecimiento",
    matrizPuntoVenta: "Punto de venta",
    matrizDireccion: "Dirección de la casa matriz",
  },
  notaSociedad: "El catálogo incluye reserva legal y capital social.",
  notaNatural: "El catálogo incluye las cuentas de capital y retiros del titular.",
  acciones: {
    cancelar: "Cancelar",
    registrar: "Registrar empresa",
    registrando: "Registrando…",
    descartar: "Descartar",
    guardar: "Guardar cambios",
    guardando: "Guardando…",
    registrada: "Empresa registrada con su casa matriz y catálogo",
    guardada: "Datos de la empresa guardados",
    corregir: "Revisa los campos marcados.",
  },
  resumen: {
    tuRol: "Tu rol",
    nit: "NIT",
  },
  cargando: "Cargando la empresa…",
  errorCarga: "No se pudo cargar la empresa.",
  reintentar: "Reintentar",
};

export const ETIQUETA_TIPO_CONTRIBUYENTE: Record<TipoContribuyente, string> = {
  persona_natural: "Persona natural",
  sociedad: "Sociedad",
};

export const ETIQUETA_CLASIFICACION: Record<ClasificacionContribuyente, string> = {
  grande: "Gran contribuyente",
  mediano: "Mediano contribuyente",
  otro: "Otro contribuyente",
};

export const ETIQUETA_NUMERACION: Record<ModoNumeracion, string> = {
  anual: "Anual: un correlativo por ejercicio",
  mensual: "Mensual: reinicia cada mes",
  por_tipo: "Por tipo de partida",
};
