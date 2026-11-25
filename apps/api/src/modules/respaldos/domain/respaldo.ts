import type {
  CrearRespaldo,
  ResultadoRestauracionRespaldo,
  RespaldoVista,
  RestaurarRespaldo,
} from "@contable/shared";

export const FORMATO_RESPALDO = "contable-respaldo-v1";

export interface ContenidoRespaldo {
  formato: typeof FORMATO_RESPALDO;
  empresaId: string;
  tipo: "empresa" | "sucursal";
  sucursalId: string | null;
  generadoEn: string;
  empresa: Record<string, unknown>;
  tablas: Record<string, Record<string, unknown>[]>;
}

export interface ArchivoRespaldo {
  contenido: ContenidoRespaldo;
  sha256: string;
  nombreArchivo: string;
}

export class EmpresaRespaldoNoEncontradaError extends Error {
  constructor() {
    super("La empresa no existe o no tienes acceso.");
  }
}

export class SinPermisoRespaldoError extends Error {
  constructor() {
    super("No tienes permiso para realizar esta operación de respaldo.");
  }
}

export class SucursalRespaldoNoAutorizadaError extends Error {
  constructor() {
    super("No tienes acceso a la sucursal indicada.");
  }
}

export class RespaldoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el respaldo de esta empresa.");
  }
}

export class RespaldoSucursalNoRestaurableError extends Error {
  constructor() {
    super("Solo se puede restaurar un respaldo de empresa completa.");
  }
}

export class EmpresaRespaldoNoVaciaError extends Error {
  constructor() {
    super("La restauración requiere una empresa vacía. No se modificó ningún dato.");
  }
}

export class RespaldoInvalidoError extends Error {
  constructor() {
    super("El archivo de respaldo está dañado o no corresponde a esta empresa.");
  }
}

export interface RepositorioRespaldos {
  listar(usuarioId: string, empresaId: string): Promise<RespaldoVista[]>;
  crear(usuarioId: string, empresaId: string, datos: CrearRespaldo): Promise<RespaldoVista>;
  descargar(usuarioId: string, empresaId: string, respaldoId: string): Promise<ArchivoRespaldo>;
  restaurar(
    usuarioId: string,
    empresaId: string,
    respaldoId: string,
    datos: RestaurarRespaldo,
  ): Promise<ResultadoRestauracionRespaldo>;
}

export const REPOSITORIO_RESPALDOS = Symbol("REPOSITORIO_RESPALDOS");
