import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { DteResumen, EstadoDte } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import { UnidadComercialPrisma } from "../../comercial/infrastructure/repositorio-comercial.prisma.js";
import { AlmacenCertificados } from "../../firma/infrastructure/almacen-certificados.js";
import {
  DteNoEncontradoError,
  NOMBRE_DTE,
  ReglaDteError,
  type EmpresaEmisora,
  type SucursalEmisora,
  type TerceroReceptor,
  type TipoDte,
} from "../domain/dte.js";
import type {
  DatosDteGuardar,
  DteGuardado,
  FiltroDte,
  RepositorioFacturacion,
  UnidadFacturacion,
} from "../domain/repositorio-facturacion.js";

interface FilaDte {
  id: string;
  tipo_dte: TipoDte;
  numero_control: string;
  codigo_generacion: string;
  fecha_emision: string;
  hora_emision: string;
  sucursal_id: string;
  receptor_nombre: string | null;
  total: string;
  iva: string;
  estado: EstadoDte;
  sello_recepcion: string;
  documento_id: string | null;
  nota_id: string | null;
  relacionado_id: string | null;
  relacionado_numero: string | null;
  relacionado_codigo: string | null;
  tipo_invalidacion: number | null;
  motivo_invalidacion: string | null;
  invalidado_en: Date | null;
  sello_invalidacion: string | null;
}

interface FilaDteCompleta extends FilaDte {
  documento: Record<string, unknown>;
  firma: string;
  certificado_id: string;
  recibido_en: Date;
  evento_invalidacion: Record<string, unknown> | null;
}

const COLUMNAS = `
  d.id::text, d.tipo_dte, d.numero_control, upper(d.codigo_generacion::text) AS codigo_generacion,
  to_char(d.fecha_emision, 'YYYY-MM-DD') AS fecha_emision, to_char(d.hora_emision, 'HH24:MI:SS') AS hora_emision,
  d.sucursal_id::text, d.receptor_nombre, d.total::text, d.iva::text, d.estado, d.sello_recepcion,
  d.documento_id::text, d.nota_id::text, d.relacionado_id::text, r.numero_control AS relacionado_numero,
  upper(r.codigo_generacion::text) AS relacionado_codigo, d.tipo_invalidacion, d.motivo_invalidacion,
  d.invalidado_en, d.sello_invalidacion`;

const aResumen = (f: FilaDte): DteResumen => ({
  id: f.id,
  tipoDte: f.tipo_dte,
  nombreTipo: NOMBRE_DTE[f.tipo_dte],
  numeroControl: f.numero_control,
  codigoGeneracion: f.codigo_generacion,
  fechaEmision: f.fecha_emision,
  horaEmision: f.hora_emision,
  sucursalId: f.sucursal_id,
  receptor: f.receptor_nombre,
  total: f.total,
  iva: f.iva,
  estado: f.estado,
  selloRecepcion: f.sello_recepcion.trim(),
  documentoId: f.documento_id,
  notaId: f.nota_id,
  relacionado:
    f.relacionado_id && f.relacionado_numero && f.relacionado_codigo
      ? { id: f.relacionado_id, numeroControl: f.relacionado_numero, codigoGeneracion: f.relacionado_codigo }
      : null,
  invalidacion:
    f.estado === "invalidado" && f.invalidado_en
      ? {
          tipo: f.tipo_invalidacion ?? 0,
          motivo: f.motivo_invalidacion ?? "",
          invalidadoEn: f.invalidado_en.toISOString(),
          selloRecepcion: f.sello_invalidacion?.trim() ?? "",
        }
      : null,
});

const aGuardado = (f: FilaDteCompleta): DteGuardado => ({
  ...aResumen(f),
  documento: f.documento,
  firma: f.firma,
  certificadoId: f.certificado_id,
  recibidoEn: f.recibido_en.toISOString(),
  evento: f.evento_invalidacion,
});

class UnidadFacturacionPrisma implements UnidadFacturacion {
  readonly comercial: UnidadComercialPrisma;
  readonly certificados: AlmacenCertificados;

  constructor(private readonly tx: Tx) {
    this.comercial = new UnidadComercialPrisma(tx);
    this.certificados = new AlmacenCertificados(tx);
  }

  async empresaEmisora(empresaId: string): Promise<EmpresaEmisora> {
    const e = await this.tx.empresa.findUnique({ where: { id: empresaId } });
    if (!e) throw new DteNoEncontradoError();
    return {
      nombre: e.nombre,
      nombreComercial: e.nombreComercial,
      nit: e.nit,
      nrc: e.nrc,
      actividadEconomica: e.actividadEconomica,
      direccion: e.direccion,
      telefono: e.telefono,
      correo: e.correo,
    };
  }

  async sucursalEmisora(empresaId: string, sucursalId: string): Promise<SucursalEmisora> {
    const s = await this.tx.sucursal.findFirst({ where: { id: sucursalId, empresaId } });
    if (!s) throw new ReglaDteError("La sucursal no existe en esta empresa.");
    return {
      codigoEstablecimiento: s.codigoEstablecimiento,
      codigoPuntoVenta: s.codigoPuntoVenta,
      esMatriz: s.esMatriz,
      direccion: s.direccion,
    };
  }

  async terceroReceptor(empresaId: string, terceroId: string): Promise<TerceroReceptor> {
    const t = await this.tx.tercero.findFirst({ where: { id: terceroId, empresaId } });
    if (!t) throw new ReglaDteError("El cliente no existe en esta empresa.");
    return {
      nombre: t.nombre,
      nit: t.nit,
      nrc: t.nrc,
      actividadEconomica: t.actividadEconomica,
      direccion: t.direccion,
      telefono: t.telefono,
      correo: t.correo,
    };
  }

  async nombreUsuario(usuarioId: string): Promise<string> {
    const u = await this.tx.usuario.findUnique({ where: { id: usuarioId }, select: { nombre: true } });
    return u?.nombre ?? "Usuario del sistema";
  }

  async siguienteCorrelativo(
    empresaId: string,
    sucursalId: string,
    tipo: TipoDte,
    anio: number,
  ): Promise<number> {
    const [fila] = await this.tx.$queryRaw<{ n: number }[]>`
      SELECT interno.siguiente_correlativo_dte(${empresaId}::uuid, ${sucursalId}::uuid, ${tipo}, ${anio}::int) AS n`;
    return Number(fila!.n);
  }

  async guardarDte(d: DatosDteGuardar): Promise<string> {
    const [fila] = await this.tx.$queryRaw<{ id: string }[]>`
      INSERT INTO documentos_electronicos (
        empresa_id, sucursal_id, tipo_dte, documento_id, nota_id, relacionado_id, codigo_generacion, numero_control,
        fecha_emision, hora_emision, receptor_nombre, total, iva, documento, firma, certificado_id, sello_recepcion,
        creado_por)
      VALUES (${d.empresaId}::uuid, ${d.sucursalId}::uuid, ${d.tipo}, ${d.documentoId}::uuid, ${d.notaId}::uuid,
              ${d.relacionadoId}::uuid, ${d.codigoGeneracion}::uuid, ${d.numeroControl}, ${d.fecha}::date,
              ${d.hora}::time, ${d.receptorNombre}, ${d.total}::numeric, ${d.iva}::numeric,
              ${JSON.stringify(d.documento)}::jsonb, ${d.firma}, ${d.certificadoId}::uuid, ${d.selloRecepcion},
              ${d.usuarioId}::uuid)
      RETURNING id::text`;
    return fila!.id;
  }

  async dtes(empresaId: string, f: FiltroDte): Promise<DteResumen[]> {
    const busqueda = f.busqueda ? `%${f.busqueda}%` : null;
    const filas = await this.tx.$queryRawUnsafe<FilaDte[]>(
      `SELECT ${COLUMNAS}
       FROM documentos_electronicos d LEFT JOIN documentos_electronicos r ON r.id = d.relacionado_id
       WHERE d.empresa_id = $1::uuid
         AND ($2::date IS NULL OR d.fecha_emision >= $2::date)
         AND ($3::date IS NULL OR d.fecha_emision <= $3::date)
         AND ($4::text IS NULL OR d.tipo_dte = $4)
         AND ($5::text IS NULL OR d.estado = $5)
         AND ($6::text IS NULL OR d.numero_control ILIKE $6 OR d.codigo_generacion::text ILIKE $6
              OR d.receptor_nombre ILIKE $6)
         AND ($7::uuid[] IS NULL OR d.sucursal_id = ANY($7::uuid[]))
       ORDER BY d.fecha_emision DESC, d.creado_en DESC
       LIMIT 500`,
      empresaId,
      f.desde ?? null,
      f.hasta ?? null,
      f.tipo ?? null,
      f.estado ?? null,
      busqueda,
      f.sucursales,
    );
    return filas.map(aResumen);
  }

  private async uno(condicion: string, valores: unknown[], bloquear: boolean): Promise<DteGuardado | null> {
    const [fila] = await this.tx.$queryRawUnsafe<FilaDteCompleta[]>(
      `SELECT ${COLUMNAS}, d.documento, d.firma, d.certificado_id::text, d.recibido_en, d.evento_invalidacion
       FROM documentos_electronicos d LEFT JOIN documentos_electronicos r ON r.id = d.relacionado_id
       WHERE ${condicion} ${bloquear ? "FOR UPDATE OF d" : ""}`,
      ...valores,
    );
    return fila ? aGuardado(fila) : null;
  }

  async dte(empresaId: string, dteId: string, bloquear = false): Promise<DteGuardado> {
    const d = await this.uno("d.id = $1::uuid AND d.empresa_id = $2::uuid", [dteId, empresaId], bloquear);
    if (!d) throw new DteNoEncontradoError();
    return d;
  }
}

@Injectable()
export class RepositorioFacturacionPrisma implements RepositorioFacturacion {
  constructor(private readonly baseDatos: BaseDatos) {}

  async enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadFacturacion) => Promise<T>): Promise<T> {
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadFacturacionPrisma(tx)));
    } catch (e) {
      const regla = mensajeDeRegla(e);
      if (regla) throw new ReglaDteError(regla);
      throw e;
    }
  }
}
