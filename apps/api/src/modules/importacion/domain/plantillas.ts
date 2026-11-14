import type { Naturaleza, TipoCuenta, TipoImportacion } from "@contable/shared";
import type { HojaLeida } from "./validacion.js";

export const PERMISO_IMPORTAR = "catalogo.importar";

export interface Columna {
  clave: string;
  titulo: string;
  ancho: number;
  /** Explicación para la hoja de instrucciones */
  ayuda: string;
}

export interface Plantilla {
  hoja: string;
  archivo: string;
  columnas: readonly Columna[];
}

/** Nombres que se muestran en la plantilla para cada naturaleza y tipo de cuenta. */
export const NATURALEZAS: Record<Naturaleza, string> = { deudora: "Deudora", acreedora: "Acreedora" };
export const TIPOS_CUENTA: Record<TipoCuenta, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio: "Patrimonio",
  costos_gastos: "Costos y gastos",
  ingresos: "Ingresos",
  liquidadora: "Liquidadora",
  orden: "Orden",
};

const CODIGO: Columna = {
  clave: "codigo",
  titulo: "Código",
  ancho: 14,
  ayuda: "Solo dígitos: 1, 2, 4, 6, 8 o 10 según el nivel (1 Activo, 11 Activo corriente, 1101…).",
};

/** Columnas de cada plantilla (S1-T68). La lectura (S1-T69) las busca por su título en la fila 1. */
export const PLANTILLAS: Record<TipoImportacion, Plantilla> = {
  catalogo: {
    hoja: "Catálogo",
    archivo: "plantilla-catalogo.xlsx",
    columnas: [
      CODIGO,
      { clave: "nombre", titulo: "Nombre", ancho: 48, ayuda: "Nombre de la cuenta, hasta 200 caracteres." },
      {
        clave: "naturaleza",
        titulo: "Naturaleza",
        ancho: 14,
        ayuda: `${Object.values(NATURALEZAS).join(" o ")}.`,
      },
      { clave: "tipo", titulo: "Tipo", ancho: 18, ayuda: `${Object.values(TIPOS_CUENTA).join(", ")}.` },
    ],
  },
  "saldos-iniciales": {
    hoja: "Saldos iniciales",
    archivo: "plantilla-saldos-iniciales.xlsx",
    columnas: [
      { ...CODIGO, ayuda: "Código de una cuenta de último nivel y activa del catálogo de la empresa." },
      {
        clave: "cuenta",
        titulo: "Cuenta",
        ancho: 48,
        ayuda: "Solo de referencia; se toma la cuenta por su código.",
      },
      {
        clave: "debe",
        titulo: "Debe",
        ancho: 16,
        ayuda: "Saldo deudor, con dos decimales como máximo. Deje vacías las cuentas sin saldo.",
      },
      {
        clave: "haber",
        titulo: "Haber",
        ancho: 16,
        ayuda: "Saldo acreedor. Cada fila lleva monto en debe o en haber, no en ambos.",
      },
    ],
  },
};

/** Cuenta del catálogo de la empresa, para validar contra ella. */
export interface CuentaExistente {
  id: string;
  codigo: string;
  nombre: string;
  naturaleza: Naturaleza;
  activa: boolean;
  /** Sin subcuentas: acepta saldos y movimientos */
  imputable: boolean;
  tieneMovimientos: boolean;
}

/** El usuario no pertenece a la empresa o ella no existe. */
export class EmpresaNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tiene acceso a ella.");
  }
}

export class SinPermisoImportarError extends Error {
  constructor() {
    super("Su rol no permite importar datos en esta empresa.");
  }
}

/** El archivo no se pudo abrir como libro de Excel. */
export class ArchivoInvalidoError extends Error {
  constructor(mensaje = "El archivo no es un libro de Excel (.xlsx) válido.") {
    super(mensaje);
  }
}

/** Puerto de lectura de lo que la importación necesita de la base. */
export interface RepositorioImportacion {
  /** Permisos del usuario en la empresa, o null si no tiene una membresía activa en ella. */
  permisos(usuarioId: string, empresaId: string): Promise<ReadonlySet<string> | null>;
  cuentas(empresaId: string): Promise<CuentaExistente[]>;
}

export const REPOSITORIO_IMPORTACION = Symbol("RepositorioImportacion");

/** Puerto para escribir y leer los libros de Excel (lo implementa ExcelJS en infrastructure). */
export interface LibrosExcel {
  plantillaCatalogo(plantilla: Plantilla): Promise<Buffer>;
  plantillaSaldos(plantilla: Plantilla, cuentas: readonly CuentaExistente[]): Promise<Buffer>;
  /** Lanza ArchivoInvalidoError si el archivo no es un .xlsx. */
  leerHoja(archivo: Buffer, plantilla: Plantilla): Promise<HojaLeida>;
}

export const LIBROS_EXCEL = Symbol("LibrosExcel");
