import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { TitularCertificado } from "../domain/certificados.js";
import type {
  CertificadoConId,
  DatosEstadoFirmado,
  EstadoFirmadoGuardado,
  RepositorioFirma,
  UnidadFirma,
} from "../domain/repositorio-firma.js";
import { AlmacenCertificados } from "./almacen-certificados.js";

interface Fila {
  id: string;
  codigo_verificacion: string;
  titulo: string;
  periodo: string;
  firmante_nombre: string;
  cargo: string;
  firmado_en: Date;
  huella_documento: string;
  empresa: string;
  nit: string;
  certificado_pem: string;
}

const SELECCION = `
  SELECT f.id::text, f.codigo_verificacion, f.titulo, f.periodo, f.firmante_nombre, f.cargo, f.firmado_en,
         f.huella_documento, coalesce(e.nombre_comercial, e.nombre) AS empresa, e.nit, c.certificado_pem
  FROM estados_firmados f
  JOIN empresas e ON e.id = f.empresa_id
  JOIN certificados_firma c ON c.id = f.certificado_id`;

const aGuardado = (f: Fila): EstadoFirmadoGuardado => ({
  id: f.id,
  codigoVerificacion: f.codigo_verificacion,
  titulo: f.titulo,
  periodo: f.periodo,
  firmante: f.firmante_nombre,
  cargo: f.cargo,
  firmadoEn: f.firmado_en.toISOString(),
  huellaDocumento: f.huella_documento.trim(),
  empresa: f.empresa,
  nit: f.nit,
  certificadoPem: f.certificado_pem,
});

class UnidadFirmaPrisma implements UnidadFirma {
  private readonly almacen: AlmacenCertificados;

  constructor(private readonly tx: Tx) {
    this.almacen = new AlmacenCertificados(tx);
  }

  get clave(): string {
    return this.almacen.clave;
  }

  autoridad() {
    return this.almacen.autoridad();
  }

  certificadoDeUsuario(
    empresaId: string,
    usuarioId: string,
    titular: TitularCertificado,
  ): Promise<CertificadoConId> {
    return this.almacen.deUsuario(empresaId, usuarioId, titular);
  }

  async empresa(empresaId: string) {
    const e = await this.tx.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { nombre: true, nombreComercial: true, nit: true },
    });
    return e;
  }

  async usuario(usuarioId: string) {
    return this.tx.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { nombre: true, correo: true },
    });
  }

  async guardar(d: DatosEstadoFirmado): Promise<void> {
    await this.tx.$executeRaw`
      INSERT INTO estados_firmados (id, empresa_id, codigo_verificacion, titulo, periodo, firmante_id, firmante_nombre,
                                    cargo, certificado_id, huella_documento, firmado_en)
      VALUES (${d.id}::uuid, ${d.empresaId}::uuid, ${d.codigoVerificacion}, ${d.titulo}, ${d.periodo},
              ${d.firmanteId}::uuid, ${d.firmanteNombre}, ${d.cargo}, ${d.certificadoId}::uuid, ${d.huellaDocumento},
              ${d.firmadoEn})`;
    await this.tx.$executeRaw`
      INSERT INTO estados_firmados_archivos (estado_firmado_id, empresa_id, pdf)
      VALUES (${d.id}::uuid, ${d.empresaId}::uuid, ${Buffer.from(d.pdf)})`;
  }

  async lista(empresaId: string): Promise<EstadoFirmadoGuardado[]> {
    const filas = await this.tx.$queryRawUnsafe<Fila[]>(
      `${SELECCION} WHERE f.empresa_id = $1::uuid ORDER BY f.firmado_en DESC LIMIT 500`,
      empresaId,
    );
    return filas.map(aGuardado);
  }

  async porId(empresaId: string, id: string): Promise<EstadoFirmadoGuardado | null> {
    const [fila] = await this.tx.$queryRawUnsafe<Fila[]>(
      `${SELECCION} WHERE f.empresa_id = $1::uuid AND f.id = $2::uuid`,
      empresaId,
      id,
    );
    return fila ? aGuardado(fila) : null;
  }

  async porCodigo(codigo: string): Promise<EstadoFirmadoGuardado | null> {
    const [fila] = await this.tx.$queryRawUnsafe<Fila[]>(
      `${SELECCION} WHERE f.codigo_verificacion = $1`,
      codigo,
    );
    return fila ? aGuardado(fila) : null;
  }

  async pdf(id: string): Promise<Uint8Array | null> {
    const [fila] = await this.tx.$queryRaw<{ pdf: Uint8Array }[]>`
      SELECT pdf FROM estados_firmados_archivos WHERE estado_firmado_id = ${id}::uuid`;
    return fila ? new Uint8Array(fila.pdf) : null;
  }
}

@Injectable()
export class RepositorioFirmaPrisma implements RepositorioFirma {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string | null, fn: (unidad: UnidadFirma) => Promise<T>): Promise<T> {
    if (usuarioId)
      return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadFirmaPrisma(tx)));
    return this.baseDatos.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return fn(new UnidadFirmaPrisma(tx));
    });
  }
}
