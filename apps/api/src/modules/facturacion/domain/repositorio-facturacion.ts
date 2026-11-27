import type { ConsultaDte, DteResumen } from "@contable/shared";
import type { UnidadComercial } from "../../comercial/domain/tercero.js";
import type { CertificadoGuardado, TitularCertificado } from "../../firma/domain/certificados.js";
import type { EmpresaEmisora, SucursalEmisora, TerceroReceptor, TipoDte } from "./dte.js";

export interface CertificadoFirmante extends CertificadoGuardado {
  id: string;
}

/** Certificados de la autoridad simulada en la misma transacción. */
export interface FuenteCertificados {
  /** FIRMA_SECRETO: descifra las llaves y deriva los sellos simulados */
  readonly clave: string;
  deEmpresa(empresaId: string, titular: TitularCertificado): Promise<CertificadoFirmante>;
  porId(id: string): Promise<CertificadoFirmante | null>;
}

export interface DatosDteGuardar {
  empresaId: string;
  sucursalId: string;
  tipo: TipoDte;
  documentoId: string | null;
  notaId: string | null;
  relacionadoId: string | null;
  codigoGeneracion: string;
  numeroControl: string;
  fecha: string;
  hora: string;
  receptorNombre: string | null;
  total: string;
  iva: string;
  documento: Record<string, unknown>;
  firma: string;
  certificadoId: string;
  selloRecepcion: string;
  usuarioId: string;
}

/** DTE guardado con lo necesario para mostrarlo, verificarlo o invalidarlo. */
export interface DteGuardado extends DteResumen {
  documento: Record<string, unknown>;
  firma: string;
  certificadoId: string;
  recibidoEn: string;
  evento: Record<string, unknown> | null;
}

export interface FiltroDte extends ConsultaDte {
  /** Sucursales que puede ver el usuario; null si ve todas */
  sucursales: readonly string[] | null;
}

/** Operaciones dentro de una transacción a nombre del usuario: la venta, su partida y el DTE se guardan juntos. */
export interface UnidadFacturacion {
  readonly comercial: UnidadComercial;
  readonly certificados: FuenteCertificados;
  empresaEmisora(empresaId: string): Promise<EmpresaEmisora>;
  sucursalEmisora(empresaId: string, sucursalId: string): Promise<SucursalEmisora>;
  terceroReceptor(empresaId: string, terceroId: string): Promise<TerceroReceptor>;
  nombreUsuario(usuarioId: string): Promise<string>;
  siguienteCorrelativo(empresaId: string, sucursalId: string, tipo: TipoDte, anio: number): Promise<number>;
  guardarDte(datos: DatosDteGuardar): Promise<string>;
  dtes(empresaId: string, filtro: FiltroDte): Promise<DteResumen[]>;
  /** Bloquea el DTE (FOR UPDATE) cuando se va a invalidar. */
  dte(empresaId: string, dteId: string, bloquear?: boolean): Promise<DteGuardado>;
}

export interface RepositorioFacturacion {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadFacturacion) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_FACTURACION = Symbol("REPOSITORIO_FACTURACION");
