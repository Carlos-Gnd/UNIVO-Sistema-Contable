import type {
  AbonoResumen,
  AbonoVista,
  ConsultaAbonos,
  ConsultaPendientes,
  DocumentoPendiente,
  OperacionComercial,
  TipoDocumentoComercial,
} from "@contable/shared";

export class AbonoNoEncontradoError extends Error {
  constructor() {
    super("El abono no existe en esta empresa.");
  }
}

/** Documento al que se quiere abonar, con su saldo pendiente (contando lo que está en borrador). */
export interface DocumentoParaAbono {
  id: string;
  operacion: OperacionComercial;
  tipoDocumento: TipoDocumentoComercial;
  numeroDocumento: string;
  fecha: string;
  terceroId: string | null;
  condicionPago: "contado" | "credito";
  estadoPartida: "borrador" | "contabilizada" | "anulada";
  saldo: string;
}

export interface DatosAbonoGuardar {
  id: string;
  empresaId: string;
  sucursalId: string;
  operacion: OperacionComercial;
  terceroId: string;
  fecha: string;
  referencia: string | null;
  cuentaPagoId: string;
  monto: string;
  partidaId: string;
  observaciones: string | null;
  usuarioId: string;
  aplicaciones: readonly { documentoId: string; monto: string }[];
}

export interface FiltroAbonos extends ConsultaAbonos {
  sucursales: readonly string[] | null;
}

export interface FiltroPendientes extends ConsultaPendientes {
  sucursales: readonly string[] | null;
}

export type { AbonoResumen, AbonoVista, DocumentoPendiente };
