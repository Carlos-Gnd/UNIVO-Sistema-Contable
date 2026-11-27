import { Inject, Injectable } from "@nestjs/common";
import { type ConsultaDte, type DteResumen, type DteVista, type EmitirVentaDte } from "@contable/shared";
import { exigirSucursal } from "../../inventario/application/casos-kardex.js";
import { registrarVentaEn, sucursalesVisibles } from "../../comercial/application/casos-documento.js";
import { descifrarClave, type TitularCertificado } from "../../firma/domain/certificados.js";
import { firmarJws } from "../../firma/domain/jws.js";
import {
  AMBIENTE_PRUEBAS,
  construirDte,
  DteNoEncontradoError,
  exigirEmisor,
  fechaHoraElSalvador,
  nuevoCodigoGeneracion,
  numeroControl,
  selloRecepcion,
  TIPOS_DTE,
  type EmpresaEmisora,
  type LineaDte,
  type TipoDte,
} from "../domain/dte.js";
import { exigirEsquema } from "../domain/esquemas-dte.js";
import {
  REPOSITORIO_FACTURACION,
  type DteGuardado,
  type RepositorioFacturacion,
  type UnidadFacturacion,
} from "../domain/repositorio-facturacion.js";

const titularEmpresa = (e: EmpresaEmisora): TitularCertificado => ({
  nombre: e.nombre,
  organizacion: e.nombreComercial ?? e.nombre,
  nit: e.nit,
  ...(e.correo ? { correo: e.correo } : {}),
});

/** Respuesta simulada de la recepción de Hacienda (estructura de la respuesta del servicio de recepción). */
function respuestaRecepcion(dte: DteGuardado): Record<string, unknown> {
  const fecha = new Date(dte.recibidoEn);
  const fh = fecha.toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return {
    version: 2,
    ambiente: AMBIENTE_PRUEBAS,
    versionApp: 2,
    estado: "PROCESADO",
    codigoGeneracion: dte.codigoGeneracion,
    selloRecibido: dte.selloRecepcion,
    fhProcesamiento: fh.replace(",", ""),
    clasificaMsg: "10",
    codigoMsg: "001",
    descripcionMsg: "RECIBIDO (SIMULADO)",
    observaciones: [],
  };
}

/** Sucursal visible para el usuario; un DTE de otra sucursal se trata como inexistente. */
async function exigirVisible(u: UnidadFacturacion, usuarioId: string, empresaId: string, dte: DteResumen) {
  const sucursales = await sucursalesVisibles(u.comercial, usuarioId, empresaId);
  if (sucursales && !sucursales.includes(dte.sucursalId)) throw new DteNoEncontradoError();
}

/**
 * Facturación electrónica (HU-53 a HU-57): emitir una factura o un CCF registra la venta y su partida en la misma
 * transacción; cada DTE se valida contra el esquema de Hacienda, se firma (JWS) con el certificado de la empresa y
 * recibe un sello de recepción simulado. La invalidación genera el evento firmado y revierte las partidas.
 * Los permisos (dte.ver, dte.emitir, dte.invalidar) los exige el controlador.
 */
@Injectable()
export class CasosDte {
  constructor(@Inject(REPOSITORIO_FACTURACION) private readonly repositorio: RepositorioFacturacion) {}

  /** Factura (01) o CCF (03) de una venta nueva (S4-T04, S4-T07). */
  emitirVenta(usuarioId: string, empresaId: string, datos: EmitirVentaDte): Promise<DteVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      await exigirSucursal(u.comercial.inventario, usuarioId, empresaId, datos.sucursalId);
      const empresa = await u.empresaEmisora(empresaId);
      exigirEmisor(empresa);
      const tipo: TipoDte = TIPOS_DTE.factura;
      const sucursal = await u.sucursalEmisora(empresaId, datos.sucursalId);
      const { fecha, hora } = fechaHoraElSalvador();
      const correlativo = await u.siguienteCorrelativo(
        empresaId,
        datos.sucursalId,
        tipo,
        Number(fecha.slice(0, 4)),
      );
      const control = numeroControl(
        tipo,
        sucursal.codigoEstablecimiento,
        sucursal.codigoPuntoVenta,
        correlativo,
      );

      // La venta se registra con el número de control y la fecha de emisión: el libro de IVA y el DTE coinciden
      const venta = await registrarVentaEn(u.comercial, usuarioId, empresaId, {
        ...datos,
        numeroDocumento: control,
        fecha,
      });
      const receptor = venta.tercero ? await u.terceroReceptor(empresaId, venta.tercero.id) : null;
      const lineas: LineaDte[] = venta.lineas.map((l) => ({
        descripcion: l.descripcion,
        codigo: l.productoCodigo,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        monto: l.monto,
        clase: l.clase,
        bien: l.productoId !== null,
      }));
      const codigoGeneracion = nuevoCodigoGeneracion();
      const documento = construirDte({
        tipo,
        codigoGeneracion,
        numeroControl: control,
        fecha,
        hora,
        empresa,
        sucursal,
        receptor,
        lineas,
        totales: venta,
        condicionPago: venta.condicionPago,
        diasCredito: venta.diasCredito,
        observaciones: venta.observaciones,
      });
      const id = await this.firmarYGuardar(u, usuarioId, empresaId, empresa, {
        tipo,
        sucursalId: datos.sucursalId,
        documentoId: venta.id,
        notaId: null,
        relacionadoId: null,
        codigoGeneracion,
        numeroControl: control,
        fecha,
        hora,
        receptorNombre: receptor?.nombre ?? null,
        total: venta.totalNeto,
        iva: venta.iva,
        documento,
      });
      return this.vista(u, empresaId, id);
    });
  }

  listar(usuarioId: string, empresaId: string, consulta: ConsultaDte): Promise<DteResumen[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u.comercial, usuarioId, empresaId);
      return u.dtes(empresaId, { ...consulta, sucursales });
    });
  }

  ver(usuarioId: string, empresaId: string, dteId: string): Promise<DteVista> {
    return this.repositorio.enTransaccion(usuarioId, (u) =>
      this.vistaVisible(u, usuarioId, empresaId, dteId),
    );
  }

  private async vistaVisible(u: UnidadFacturacion, usuarioId: string, empresaId: string, dteId: string) {
    const dte = await u.dte(empresaId, dteId);
    await exigirVisible(u, usuarioId, empresaId, dte);
    return this.vista(u, empresaId, dteId);
  }

  private async firmarYGuardar(
    u: UnidadFacturacion,
    usuarioId: string,
    empresaId: string,
    empresa: EmpresaEmisora,
    d: Omit<
      Parameters<UnidadFacturacion["guardarDte"]>[0],
      "empresaId" | "firma" | "certificadoId" | "selloRecepcion" | "usuarioId"
    >,
  ): Promise<string> {
    // Un DTE que no cumple el esquema de Hacienda no se firma: la transacción se revierte con la venta
    exigirEsquema(d.tipo, d.documento);
    const certificado = await u.certificados.deEmpresa(empresaId, titularEmpresa(empresa));
    const firma = firmarJws(
      d.documento,
      descifrarClave(certificado.clavePrivadaCifrada, u.certificados.clave),
    );
    return u.guardarDte({
      ...d,
      empresaId,
      firma,
      certificadoId: certificado.id,
      selloRecepcion: selloRecepcion(d.fecha.slice(0, 4), d.codigoGeneracion, firma, u.certificados.clave),
      usuarioId,
    });
  }

  private async vista(u: UnidadFacturacion, empresaId: string, dteId: string): Promise<DteVista> {
    const dte = await u.dte(empresaId, dteId);
    return {
      id: dte.id,
      tipoDte: dte.tipoDte,
      nombreTipo: dte.nombreTipo,
      numeroControl: dte.numeroControl,
      codigoGeneracion: dte.codigoGeneracion,
      fechaEmision: dte.fechaEmision,
      horaEmision: dte.horaEmision,
      sucursalId: dte.sucursalId,
      receptor: dte.receptor,
      total: dte.total,
      iva: dte.iva,
      estado: dte.estado,
      selloRecepcion: dte.selloRecepcion,
      documentoId: dte.documentoId,
      notaId: dte.notaId,
      relacionado: dte.relacionado,
      invalidacion: dte.invalidacion,
      firma: dte.firma,
      evento: dte.evento,
      documento: dte.documento,
      respuesta: respuestaRecepcion(dte),
    };
  }
}
