import {
  CODIGO_DTE_INICIAL,
  type ClasificacionContribuyente,
  type CrearEmpresaEntrada,
  type EditarEmpresaEntrada,
  type EmpresaDetalle,
  type ModoNumeracion,
  type TipoContribuyente,
} from "@contable/shared";

/** Valores del formulario: todo texto, como lo escribe el usuario. */
export interface ValoresEmpresa {
  nombre: string;
  nombreComercial: string;
  tipoContribuyente: TipoContribuyente;
  nit: string;
  nrc: string;
  clasificacion: ClasificacionContribuyente;
  actividadEconomica: string;
  direccion: string;
  telefono: string;
  correo: string;
  modoNumeracion: ModoNumeracion;
}

export interface ValoresCasaMatriz {
  nombre: string;
  codigoEstablecimiento: string;
  codigoPuntoVenta: string;
  direccion: string;
}

export const VALORES_NUEVA: ValoresEmpresa = {
  nombre: "",
  nombreComercial: "",
  tipoContribuyente: "sociedad",
  nit: "",
  nrc: "",
  clasificacion: "otro",
  actividadEconomica: "",
  direccion: "",
  telefono: "",
  correo: "",
  modoNumeracion: "anual",
};

export const MATRIZ_NUEVA: ValoresCasaMatriz = {
  nombre: "Casa matriz",
  codigoEstablecimiento: CODIGO_DTE_INICIAL,
  codigoPuntoVenta: CODIGO_DTE_INICIAL,
  direccion: "",
};

export function valoresDeEmpresa(e: EmpresaDetalle): ValoresEmpresa {
  return {
    nombre: e.nombre,
    nombreComercial: e.nombreComercial ?? "",
    tipoContribuyente: e.tipoContribuyente,
    nit: e.nit,
    nrc: e.nrc ?? "",
    clasificacion: e.clasificacion,
    actividadEconomica: e.actividadEconomica ?? "",
    direccion: e.direccion ?? "",
    telefono: e.telefono ?? "",
    correo: e.correo ?? "",
    modoNumeracion: e.modoNumeracion,
  };
}

/** Datos para registrar: la casa matriz va anidada (S1-T44). */
export const entradaRegistro = (v: ValoresEmpresa, matriz: ValoresCasaMatriz): CrearEmpresaEntrada => ({
  ...v,
  casaMatriz: matriz,
});

/**
 * Solo los campos editables que cambiaron, para el PATCH. Un texto vaciado se envía como "" y la API lo
 * borra; el tipo de contribuyente no se edita.
 */
export function cambiosEmpresa(actual: ValoresEmpresa, inicial: ValoresEmpresa): EditarEmpresaEntrada {
  const cambios: Record<string, string> = {};
  for (const campo of Object.keys(actual) as (keyof ValoresEmpresa)[]) {
    if (campo === "tipoContribuyente") continue;
    if (actual[campo].trim() !== inicial[campo].trim()) cambios[campo] = actual[campo];
  }
  return cambios as EditarEmpresaEntrada;
}
