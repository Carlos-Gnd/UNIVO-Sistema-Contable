// Módulo reservado (ver README). Contrato del asistente; apagado por defecto.

/** Datos de una compra sugeridos a partir de un documento. Todos los montos en texto con 2 decimales. */
export interface CompraSugerida {
  proveedorNombre?: string;
  proveedorNrc?: string;
  documentoTipo?: "CCF" | "FACTURA" | "OTRO";
  documentoNumero?: string;
  fecha?: string; // aaaa-mm-dd
  montoGravado?: string;
  montoExento?: string;
  iva?: string;
  total?: string;
  /** 0 a 1: confianza global de la extracción */
  confianza: number;
}

export interface AnalisisEstados {
  resumen: string;
  hallazgos: string[];
}

export interface CuentaSugerida {
  codigo: string;
  nombre: string;
  confianza: number;
}

/** Contrato que implementa cada proveedor de IA. */
export interface ProveedorAsistente {
  readonly nombre: string;
  extraerCompra(documento: { contenido: Uint8Array; tipoMime: string }): Promise<CompraSugerida>;
  analizarEstados(datos: { periodo: string; estados: unknown; razones: unknown }): Promise<AnalisisEstados>;
  sugerirCuentas(concepto: string, catalogo: { codigo: string; nombre: string }[]): Promise<CuentaSugerida[]>;
}

export class AsistenteNoDisponible extends Error {
  constructor() {
    super("El asistente no está habilitado");
    this.name = "AsistenteNoDisponible";
  }
}

/** Proveedor usado mientras el módulo está apagado. */
export const proveedorNulo: ProveedorAsistente = {
  nombre: "nulo",
  extraerCompra: () => Promise.reject(new AsistenteNoDisponible()),
  analizarEstados: () => Promise.reject(new AsistenteNoDisponible()),
  sugerirCuentas: () => Promise.reject(new AsistenteNoDisponible()),
};

export function asistenteHabilitado(env: Record<string, string | undefined> = process.env): boolean {
  return env["ASISTENTE_HABILITADO"] === "true";
}
