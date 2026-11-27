import type { EstadoFirmadoVista } from "@contable/shared";
import type { CertificadoGuardado, TitularCertificado } from "./certificados.js";

export interface CertificadoConId extends CertificadoGuardado {
  id: string;
}

export class EstadoFirmadoNoEncontradoError extends Error {
  constructor() {
    super("No hay un estado financiero firmado con ese código.");
  }
}

export interface DatosEstadoFirmado {
  id: string;
  empresaId: string;
  codigoVerificacion: string;
  titulo: string;
  periodo: string;
  firmanteId: string;
  firmanteNombre: string;
  cargo: string;
  certificadoId: string;
  huellaDocumento: string;
  firmadoEn: Date;
  pdf: Uint8Array;
}

/** Firma guardada con los datos públicos que muestra el portal. */
export interface EstadoFirmadoGuardado extends Omit<EstadoFirmadoVista, "urlVerificacion"> {
  empresa: string;
  nit: string;
  certificadoPem: string;
}

export interface UnidadFirma {
  /** FIRMA_SECRETO del servidor */
  readonly clave: string;
  autoridad(): Promise<CertificadoGuardado>;
  certificadoDeUsuario(
    empresaId: string,
    usuarioId: string,
    titular: TitularCertificado,
  ): Promise<CertificadoConId>;
  empresa(empresaId: string): Promise<{ nombre: string; nombreComercial: string | null; nit: string }>;
  usuario(usuarioId: string): Promise<{ nombre: string; correo: string }>;
  guardar(datos: DatosEstadoFirmado): Promise<void>;
  lista(empresaId: string): Promise<EstadoFirmadoGuardado[]>;
  porId(empresaId: string, id: string): Promise<EstadoFirmadoGuardado | null>;
  pdf(id: string): Promise<Uint8Array | null>;
}

export interface RepositorioFirma {
  /** Con usuario, a su nombre (bitácora); sin usuario, de solo lectura para el portal público. */
  enTransaccion<T>(usuarioId: string | null, fn: (unidad: UnidadFirma) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_FIRMA = Symbol("REPOSITORIO_FIRMA");
