import type {
  AbonoResumen,
  AbonoVista,
  DocumentoPendiente,
  CrearTercero,
  CuentaInfo,
  DocumentoComercialResumen,
  DocumentoComercialVista,
  EditarTercero,
  NotaComercialResumen,
  NotaComercialVista,
  OperacionComercial,
  RolTercero,
  TerceroVista,
} from "@contable/shared";
import type { UnidadInventario } from "../../inventario/domain/producto.js";
import type { DatosAbonoGuardar, DocumentoParaAbono, FiltroAbonos, FiltroPendientes } from "./abono.js";
import type { FiltroAntiguedad, SaldoDocumentoAl } from "./antiguedad.js";
import type { AcumuladoNotas, DatosNotaGuardar, DocumentoParaNota, FiltroNotas } from "./nota.js";
import type {
  CuentaResuelta,
  DatosDocumentoGuardar,
  DatosPartidaBorrador,
  DatosTerceroDocumento,
  FiltroDocumentos,
  ParametrosComerciales,
} from "./documento.js";

export class TerceroNoEncontradoError extends Error {
  constructor() {
    super("El cliente o proveedor no existe en esta empresa.");
  }
}

/** El NIT o el NRC ya lo usa otro cliente o proveedor de la empresa. */
export class TerceroDuplicadoError extends Error {
  constructor(campo: "nit" | "nrc", valor: string) {
    super(
      campo === "nit"
        ? `Ya existe un cliente o proveedor con el NIT ${valor} en esta empresa.`
        : `Ya existe un cliente o proveedor con el NRC ${valor} en esta empresa.`,
    );
  }
}

/** Regla del negocio rechazada por la API o por la base de datos. */
export class ReglaComercialError extends Error {}

export interface FiltroTerceros {
  rol?: RolTercero;
  /** Texto contenido en el nombre, el NIT o el NRC */
  busqueda?: string;
  /** Sin valor, todos; true solo activos; false solo inactivos */
  activo?: boolean;
}

/** Operaciones dentro de una transacción a nombre del usuario (la bitácora registra quién hizo cada cambio). */
export interface UnidadComercial {
  terceros(empresaId: string, filtro: FiltroTerceros): Promise<TerceroVista[]>;
  tercero(empresaId: string, terceroId: string): Promise<TerceroVista>;
  crearTercero(empresaId: string, datos: CrearTercero): Promise<TerceroVista>;
  editarTercero(empresaId: string, terceroId: string, cambios: EditarTercero): Promise<TerceroVista>;

  /** Inventario y kardex de la misma transacción: las compras y ventas reutilizan su servicio. */
  readonly inventario: UnidadInventario;
  datosTerceroDocumento(empresaId: string, terceroId: string): Promise<DatosTerceroDocumento>;
  parametros(empresaId: string): Promise<ParametrosComerciales>;
  /** Cuenta de último nivel del código dado (o la primera de sus subcuentas), o null si no existe. */
  cuentaPorCodigo(empresaId: string, codigo: string): Promise<CuentaResuelta | null>;
  cuentasInfo(empresaId: string, ids: readonly string[]): Promise<CuentaInfo[]>;
  documentoRegistrado(
    empresaId: string,
    operacion: OperacionComercial,
    tipoDocumento: string,
    terceroId: string | null,
    numero: string,
  ): Promise<boolean>;
  /** Crea la partida en borrador con sus líneas y devuelve su id. */
  crearPartidaBorrador(datos: DatosPartidaBorrador): Promise<string>;
  crearDocumento(datos: DatosDocumentoGuardar): Promise<void>;
  documentos(empresaId: string, filtro: FiltroDocumentos): Promise<DocumentoComercialResumen[]>;
  documento(
    empresaId: string,
    operacion: OperacionComercial,
    documentoId: string,
  ): Promise<DocumentoComercialVista>;

  // Devoluciones y rebajas (HU-61)
  documentoParaNota(empresaId: string, documentoId: string): Promise<DocumentoParaNota>;
  /** Unidades e importe ya devueltos o rebajados por línea del documento (notas de crédito no anuladas). */
  acumuladoNotas(documentoId: string): Promise<AcumuladoNotas>;
  /** Saldo por cobrar o por pagar del documento, contando también lo que está en borrador. */
  saldoDocumento(documentoId: string): Promise<string>;
  notaRegistrada(
    empresaId: string,
    operacion: OperacionComercial,
    tipo: string,
    terceroId: string | null,
    numero: string,
  ): Promise<boolean>;
  crearNota(datos: DatosNotaGuardar): Promise<void>;
  notas(empresaId: string, filtro: FiltroNotas): Promise<NotaComercialResumen[]>;
  nota(empresaId: string, notaId: string): Promise<NotaComercialVista>;

  // Abonos de cuentas por cobrar y por pagar (HU-62)
  documentosParaAbono(empresaId: string, ids: readonly string[]): Promise<DocumentoParaAbono[]>;
  crearAbono(datos: DatosAbonoGuardar): Promise<void>;
  abonos(empresaId: string, filtro: FiltroAbonos): Promise<AbonoResumen[]>;
  abono(empresaId: string, abonoId: string): Promise<AbonoVista>;
  /** Documentos al crédito con saldo por cobrar o por pagar, del más viejo al más nuevo. */
  pendientes(empresaId: string, filtro: FiltroPendientes): Promise<DocumentoPendiente[]>;

  // Antigüedad de saldos (HU-63)
  /** Documentos al crédito contabilizados con su saldo a la fecha de corte (solo los que aún tienen saldo). */
  saldosAl(empresaId: string, filtro: FiltroAntiguedad): Promise<SaldoDocumentoAl[]>;
  /** Saldo de la cuenta de cuentas por cobrar (venta) o por pagar (compra) en el mayor a la fecha de corte. */
  saldoMayor(empresaId: string, filtro: FiltroAntiguedad): Promise<{ codigo: string; saldo: string }>;
}

export interface RepositorioComercial {
  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadComercial) => Promise<T>): Promise<T>;
}

export const REPOSITORIO_COMERCIAL = Symbol("REPOSITORIO_COMERCIAL");
