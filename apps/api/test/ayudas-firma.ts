// Repositorio de firmas en memoria para probar la firma de estados (HU-87) y el portal (HU-88) sin PostgreSQL:
// la autoridad, los certificados y los PDF firmados son reales; solo el almacenamiento es un Map.
import { randomUUID } from "node:crypto";
import type { FirmarEstado } from "@contable/shared";
import {
  crearAutoridad,
  emitirCertificado,
  type CertificadoGuardado,
} from "../src/modules/firma/domain/certificados.js";
import type {
  CertificadoConId,
  DatosEstadoFirmado,
  EstadoFirmadoGuardado,
  RepositorioFirma,
  UnidadFirma,
} from "../src/modules/firma/domain/repositorio-firma.js";

export const SECRETO_FIRMA = "secreto-de-pruebas-de-firma-con-mas-de-32-caracteres";
export const EMPRESA_ID = "00000000-0000-4000-8000-0000000000e1";
export const CONTADOR_ID = "11111111-1111-4111-8111-111111111111";
export const GERENTE_ID = "33333333-3333-4333-8333-333333333333";

const USUARIOS: Record<string, { nombre: string; correo: string }> = {
  [CONTADOR_ID]: { nombre: "María José Núñez", correo: "contador@cherophonex.test" },
  [GERENTE_ID]: { nombre: "Carlos Ramírez", correo: "gerente@cherophonex.test" },
};

export const EMPRESA = {
  nombre: "CheroPhonex, S.A. de C.V.",
  nombreComercial: "CheroPhonex",
  nit: "0614-010190-101-7",
};

/** Balance general de CheroPhonex que se firma en las pruebas. */
export const BALANCE: FirmarEstado = {
  titulo: "Balance general",
  periodo: "Al 31 de octubre de 2026",
  alcance: "Empresa (todas las sucursales)",
  columnas: [{ titulo: "Saldo", tipo: "dinero" }],
  filas: [
    { tipo: "seccion", texto: "Activo" },
    { tipo: "renglon", texto: "Efectivo y equivalentes", valores: ["12500.00"] },
    { tipo: "renglon", texto: "Inventarios", valores: ["8300.50"] },
    { tipo: "total", texto: "Total activo", valores: ["20800.50"] },
    { tipo: "parrafo", texto: "Las cifras están expresadas en dólares." },
  ],
};

export class RepositorioFirmaEnMemoria implements RepositorioFirma {
  readonly autoridad: CertificadoGuardado = crearAutoridad(SECRETO_FIRMA);
  readonly certificados = new Map<string, CertificadoConId>();
  readonly firmas: DatosEstadoFirmado[] = [];

  private guardada(f: DatosEstadoFirmado): EstadoFirmadoGuardado {
    return {
      id: f.id,
      codigoVerificacion: f.codigoVerificacion,
      titulo: f.titulo,
      periodo: f.periodo,
      firmante: f.firmanteNombre,
      cargo: f.cargo,
      firmadoEn: f.firmadoEn.toISOString(),
      huellaDocumento: f.huellaDocumento,
      empresa: EMPRESA.nombre,
      nit: EMPRESA.nit,
      certificadoPem: [...this.certificados.values()].find((c) => c.id === f.certificadoId)!.certificadoPem,
    };
  }

  private readonly unidad: UnidadFirma = {
    clave: SECRETO_FIRMA,
    autoridad: async () => this.autoridad,
    certificadoDeUsuario: async (empresaId, usuarioId, titular) => {
      const clave = `${empresaId}:${usuarioId}`;
      let certificado = this.certificados.get(clave);
      if (!certificado) {
        certificado = { id: randomUUID(), ...emitirCertificado(this.autoridad, titular, SECRETO_FIRMA) };
        this.certificados.set(clave, certificado);
      }
      return certificado;
    },
    empresa: async () => EMPRESA,
    usuario: async (usuarioId) => USUARIOS[usuarioId]!,
    guardar: async (datos) => {
      // Se guarda una copia: lo que la prueba haga después con el PDF devuelto no cambia lo guardado
      this.firmas.push({ ...datos, pdf: new Uint8Array(datos.pdf) });
    },
    lista: async (empresaId) =>
      this.firmas
        .filter((f) => f.empresaId === empresaId)
        .reverse()
        .map((f) => this.guardada(f)),
    porId: async (empresaId, id) => {
      const f = this.firmas.find((x) => x.empresaId === empresaId && x.id === id);
      return f ? this.guardada(f) : null;
    },
    porCodigo: async (codigo) => {
      const f = this.firmas.find((x) => x.codigoVerificacion === codigo);
      return f ? this.guardada(f) : null;
    },
    pdf: async (id) => {
      const f = this.firmas.find((x) => x.id === id);
      return f ? new Uint8Array(f.pdf) : null;
    },
  };

  enTransaccion<T>(_usuarioId: string | null, fn: (unidad: UnidadFirma) => Promise<T>): Promise<T> {
    return fn(this.unidad);
  }
}

/** Copia del PDF con un byte cambiado en la posición dada (se invierten sus bits). */
export function conByteCambiado(pdf: Uint8Array, posicion: number): Buffer {
  const copia = Buffer.from(pdf);
  copia[posicion] = copia[posicion]! ^ 0xff;
  return copia;
}

/** Rangos firmados [inicio1, largo1, inicio2, largo2] del /ByteRange del PDF. */
export function rangosFirmados(pdf: Uint8Array): [number, number, number, number] {
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(Buffer.from(pdf).toString("latin1"));
  if (!m) throw new Error("El PDF no trae /ByteRange.");
  return m.slice(1, 5).map(Number) as [number, number, number, number];
}
