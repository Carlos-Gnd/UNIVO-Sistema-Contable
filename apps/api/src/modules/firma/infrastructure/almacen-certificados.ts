import type { Tx } from "@contable/db";
import {
  certificadoValido,
  crearAutoridad,
  emitirCertificado,
  secretoFirma,
  type CertificadoGuardado,
  type TitularCertificado,
} from "../domain/certificados.js";

/** Certificado guardado con su id. */
export interface CertificadoConId extends CertificadoGuardado {
  id: string;
}

interface FilaCertificado {
  id: string;
  titular: string;
  numero_serie: string;
  certificado_pem: string;
  clave_privada_cifrada: string;
  huella: string;
  valido_desde: Date;
  valido_hasta: Date;
}

const aCertificado = (f: FilaCertificado): CertificadoConId => ({
  id: f.id,
  titular: f.titular,
  numeroSerie: f.numero_serie,
  certificadoPem: f.certificado_pem,
  clavePrivadaCifrada: f.clave_privada_cifrada,
  huella: f.huella.trim(),
  validoDesde: f.valido_desde,
  validoHasta: f.valido_hasta,
});

/**
 * Certificados de la autoridad simulada dentro de una transacción: la autoridad y cada certificado se crean la primera
 * vez que se necesitan; uno vencido se reemplaza por otro nuevo y el anterior se conserva para verificar sus firmas.
 */
export class AlmacenCertificados {
  constructor(
    private readonly tx: Tx,
    private readonly secretoFijo?: string,
  ) {}

  /** FIRMA_SECRETO; se lee al usarlo, así consultar una firma no lo exige. */
  get clave(): string {
    return this.secretoFijo ?? secretoFirma();
  }

  async autoridad(): Promise<CertificadoGuardado> {
    const leer = () =>
      this.tx.$queryRaw<Omit<FilaCertificado, "id" | "titular" | "numero_serie">[]>`
        SELECT certificado_pem, clave_privada_cifrada, huella, valido_desde, valido_hasta
        FROM autoridad_certificadora WHERE id = 1`;
    let [fila] = await leer();
    if (!fila) {
      const nueva = crearAutoridad(this.clave);
      // Si otra petición la creó al mismo tiempo, se usa la suya
      await this.tx.$executeRaw`
        INSERT INTO autoridad_certificadora (id, certificado_pem, clave_privada_cifrada, huella, valido_desde, valido_hasta)
        VALUES (1, ${nueva.certificadoPem}, ${nueva.clavePrivadaCifrada}, ${nueva.huella},
                ${nueva.validoDesde}, ${nueva.validoHasta})
        ON CONFLICT (id) DO NOTHING`;
      [fila] = await leer();
    }
    return {
      titular: "",
      numeroSerie: "",
      certificadoPem: fila!.certificado_pem,
      clavePrivadaCifrada: fila!.clave_privada_cifrada,
      huella: fila!.huella.trim(),
      validoDesde: fila!.valido_desde,
      validoHasta: fila!.valido_hasta,
    };
  }

  /** Certificado de la empresa con que se firman sus DTE. */
  deEmpresa(empresaId: string, titular: TitularCertificado): Promise<CertificadoConId> {
    return this.obtener(empresaId, null, titular);
  }

  /** Un certificado por su id (por ejemplo, el de una firma ya hecha). */
  async porId(id: string): Promise<CertificadoConId | null> {
    const [fila] = await this.tx.$queryRaw<FilaCertificado[]>`
      SELECT id::text, titular, numero_serie, certificado_pem, clave_privada_cifrada, huella, valido_desde, valido_hasta
      FROM certificados_firma WHERE id = ${id}::uuid`;
    return fila ? aCertificado(fila) : null;
  }

  private async obtener(
    empresaId: string,
    usuarioId: string | null,
    titular: TitularCertificado,
  ): Promise<CertificadoConId> {
    const autoridad = await this.autoridad();
    // El bloqueo por empresa y titular evita emitir dos certificados a la vez
    await this.tx
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`certificado:${empresaId}:${usuarioId ?? "empresa"}`}))`;
    const [fila] = await this.tx.$queryRaw<FilaCertificado[]>`
      SELECT id::text, titular, numero_serie, certificado_pem, clave_privada_cifrada, huella, valido_desde, valido_hasta
      FROM certificados_firma
      WHERE empresa_id = ${empresaId}::uuid AND usuario_id IS NOT DISTINCT FROM ${usuarioId}::uuid AND vigente`;
    // Se reutiliza mientras esté vigente, lo haya emitido la autoridad actual y conserve el nombre del titular
    if (
      fila &&
      fila.titular === titular.nombre.slice(0, 64) &&
      certificadoValido(fila.certificado_pem, autoridad.certificadoPem)
    ) {
      return aCertificado(fila);
    }

    const nuevo = emitirCertificado(autoridad, titular, this.clave);
    // El anterior deja de usarse pero se conserva: las firmas hechas con él se siguen verificando
    if (fila)
      await this.tx.$executeRaw`UPDATE certificados_firma SET vigente = false WHERE id = ${fila.id}::uuid`;
    const [guardado] = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO certificados_firma (empresa_id, usuario_id, titular, numero_serie, certificado_pem,
                                      clave_privada_cifrada, huella, valido_desde, valido_hasta)
      VALUES (${empresaId}::uuid, ${usuarioId}::uuid, ${nuevo.titular}, ${nuevo.numeroSerie},
              ${nuevo.certificadoPem}, ${nuevo.clavePrivadaCifrada}, ${nuevo.huella},
              ${nuevo.validoDesde}, ${nuevo.validoHasta})
      RETURNING id::text`;
    return { ...nuevo, id: guardado!.id };
  }
}
