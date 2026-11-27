import { Inject, Injectable } from "@nestjs/common";
import {
  costoUnitarioDeTotal,
  type ConsultaDte,
  type DteResumen,
  type DteVista,
  type EmitirNotaDte,
  type EmitirVentaDte,
  type InvalidarDte,
} from "@contable/shared";
import { exigirSucursal, registrarMovimientoKardex } from "../../inventario/application/casos-kardex.js";
import { registrarVentaEn, sucursalesVisibles } from "../../comercial/application/casos-documento.js";
import { registrarNotaEn } from "../../comercial/application/casos-nota.js";
import { conceptoDeReversion, lineasDeReversion } from "../../contabilidad/domain/anulacion.js";
import { descifrarClave, type TitularCertificado } from "../../firma/domain/certificados.js";
import { firmarJws, verificarJws } from "../../firma/domain/jws.js";
import {
  AMBIENTE_PRUEBAS,
  construirDte,
  construirInvalidacion,
  DteNoEncontradoError,
  enlaceConsulta,
  exigirEmisor,
  fechaHoraElSalvador,
  nuevoCodigoGeneracion,
  numeroControl,
  ReglaDteError,
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
import { representacionGrafica } from "../infrastructure/representacion-grafica.js";

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

/** JSON con las claves ordenadas, para comparar documentos sin importar el orden. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const o = valor as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`)
    .join(",")}}`;
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
      const tipo: TipoDte = datos.tipoDocumento === "ccf" ? TIPOS_DTE.ccf : TIPOS_DTE.factura;
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

  /** Nota de crédito (05) o de débito (06) sobre una venta con CCF electrónico (S4-T10). */
  emitirNota(usuarioId: string, empresaId: string, datos: EmitirNotaDte): Promise<DteVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const ccf = await u.dteDeDocumento(empresaId, datos.documentoId);
      if (!ccf || ccf.tipoDte !== TIPOS_DTE.ccf) {
        throw new ReglaDteError(
          "Las notas electrónicas corrigen un comprobante de crédito fiscal electrónico: la venta no tiene CCF electrónico.",
        );
      }
      if (ccf.estado !== "procesado")
        throw new ReglaDteError("El CCF de la venta está invalidado: no admite notas.");
      await exigirSucursal(u.comercial.inventario, usuarioId, empresaId, ccf.sucursalId);
      const empresa = await u.empresaEmisora(empresaId);
      exigirEmisor(empresa);

      const tipo: TipoDte = datos.tipo === "credito" ? TIPOS_DTE.notaCredito : TIPOS_DTE.notaDebito;
      const sucursal = await u.sucursalEmisora(empresaId, ccf.sucursalId);
      const { fecha, hora } = fechaHoraElSalvador();
      const correlativo = await u.siguienteCorrelativo(
        empresaId,
        ccf.sucursalId,
        tipo,
        Number(fecha.slice(0, 4)),
      );
      const control = numeroControl(
        tipo,
        sucursal.codigoEstablecimiento,
        sucursal.codigoPuntoVenta,
        correlativo,
      );

      const nota = await registrarNotaEn(u.comercial, usuarioId, empresaId, {
        ...datos,
        numeroNota: control,
        fecha,
      });
      const venta = await u.comercial.documento(empresaId, "venta", datos.documentoId);
      const receptor = await u.terceroReceptor(empresaId, venta.tercero!.id);
      const lineas: LineaDte[] = nota.lineas.map((l) => {
        // Una rebaja o un cargo no mueve unidades: va como una unidad por el importe
        const sinUnidades = Number(l.cantidad) <= 0;
        return {
          descripcion: l.descripcion,
          codigo: l.productoCodigo,
          cantidad: sinUnidades ? "1" : l.cantidad,
          precioUnitario: sinUnidades ? l.monto : l.precioUnitario,
          monto: l.monto,
          clase: l.clase,
          bien: l.productoId !== null,
        };
      });
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
        totales: nota,
        condicionPago: venta.condicionPago,
        diasCredito: venta.diasCredito,
        observaciones: nota.observaciones,
        relacionado: { tipo: TIPOS_DTE.ccf, codigoGeneracion: ccf.codigoGeneracion, fecha: ccf.fechaEmision },
      });
      const id = await this.firmarYGuardar(u, usuarioId, empresaId, empresa, {
        tipo,
        sucursalId: ccf.sucursalId,
        documentoId: null,
        notaId: nota.id,
        relacionadoId: ccf.id,
        codigoGeneracion,
        numeroControl: control,
        fecha,
        hora,
        receptorNombre: receptor.nombre,
        total: nota.totalNeto,
        iva: nota.iva,
        documento,
      });
      return this.vista(u, empresaId, id);
    });
  }

  /**
   * Invalida un DTE (S4-T16): exige motivo, genera y firma el evento de invalidación y revierte las partidas de la
   * venta o de la nota (las de borrador se contabilizan y se revierten, para que quede el rastro). La mercadería de
   * una venta regresa al kardex con el costo con que salió. Un DTE invalidado no se vuelve a emitir.
   */
  invalidar(usuarioId: string, empresaId: string, dteId: string, datos: InvalidarDte): Promise<DteVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const dte = await u.dte(empresaId, dteId, true);
      await exigirVisible(u, usuarioId, empresaId, dte);
      await exigirSucursal(u.comercial.inventario, usuarioId, empresaId, dte.sucursalId);
      if (dte.estado === "invalidado") throw new ReglaDteError("El DTE ya está invalidado.");
      const empresa = await u.empresaEmisora(empresaId);
      exigirEmisor(empresa);
      const sucursal = await u.sucursalEmisora(empresaId, dte.sucursalId);
      const { fecha, hora } = fechaHoraElSalvador();
      const motivo = datos.motivo.trim();
      const concepto = `Invalidación del DTE ${dte.numeroControl}: ${motivo}`;

      let partidas: (string | null)[];
      if (dte.documentoId) {
        if ((await u.notasVigentes(dte.documentoId)) > 0) {
          throw new ReglaDteError("La venta tiene notas de crédito o débito vigentes: invalídalas primero.");
        }
        const venta = await u.comercial.documento(empresaId, "venta", dte.documentoId);
        const original = await u.comercial.documentoParaNota(empresaId, dte.documentoId);
        // La mercadería regresa al kardex al costo con que salió, como en una devolución
        for (const l of original.lineas) {
          if (!l.productoId) continue;
          if (l.controlaSeries) {
            throw new ReglaDteError(
              `«${l.descripcion}» se controla por serie: sus unidades no se reingresan al invalidar. Emite una nota de crédito.`,
            );
          }
          if (l.costoKardex !== null) {
            await registrarMovimientoKardex(u.comercial.inventario, usuarioId, empresaId, {
              productoId: l.productoId,
              sucursalId: dte.sucursalId,
              fecha,
              tipo: "entrada",
              cantidad: l.cantidad,
              costoUnitario: costoUnitarioDeTotal(l.costoKardex, l.cantidad),
              referencia: dte.numeroControl,
            });
          }
        }
        partidas = [venta.partidaId, venta.partidaCostoId];
      } else {
        const nota = await u.comercial.nota(empresaId, dte.notaId!);
        if (nota.motivo === "devolucion") {
          throw new ReglaDteError(
            "Una nota de devolución no se invalida: la mercadería ya regresó al kardex. Emite una nota de débito.",
          );
        }
        partidas = [nota.partidaId, nota.partidaCostoId];
      }
      for (const partidaId of partidas) {
        if (partidaId) await this.revertirPartida(u, empresaId, partidaId, fecha, concepto);
      }

      const evento = construirInvalidacion({
        codigoGeneracion: nuevoCodigoGeneracion(),
        fecha,
        hora,
        empresa,
        sucursal,
        responsable: { nombre: await u.nombreUsuario(usuarioId) },
        tipoInvalidacion: datos.tipoInvalidacion as 1 | 2 | 3,
        motivo,
        documento: {
          tipo: dte.tipoDte,
          codigoGeneracion: dte.codigoGeneracion,
          selloRecibido: dte.selloRecepcion,
          numeroControl: dte.numeroControl,
          fecha: dte.fechaEmision,
          montoIva: dte.iva,
          receptor: await this.receptorDe(u, empresaId, dte),
        },
      });
      exigirEsquema("invalidacion", evento);
      const certificado = await u.certificados.deEmpresa(empresaId, titularEmpresa(empresa));
      const firma = firmarJws(evento, descifrarClave(certificado.clavePrivadaCifrada, u.certificados.clave));
      const codigoEvento = (evento["identificacion"] as { codigoGeneracion: string }).codigoGeneracion;
      await u.invalidar(dte.id, {
        tipo: datos.tipoInvalidacion,
        motivo,
        evento,
        firma,
        sello: selloRecepcion(fecha.slice(0, 4), codigoEvento, firma, u.certificados.clave),
        usuarioId,
      });
      return this.vista(u, empresaId, dte.id);
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

  /** Representación gráfica en PDF con el QR de la consulta pública (S4-T13). */
  pdf(usuarioId: string, empresaId: string, dteId: string): Promise<{ nombre: string; pdf: Uint8Array }> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const vista = await this.vistaVisible(u, usuarioId, empresaId, dteId);
      return { nombre: `${vista.numeroControl}.pdf`, pdf: await representacionGrafica(vista) };
    });
  }

  private async vistaVisible(u: UnidadFacturacion, usuarioId: string, empresaId: string, dteId: string) {
    const dte = await u.dte(empresaId, dteId);
    await exigirVisible(u, usuarioId, empresaId, dte);
    return this.vista(u, empresaId, dteId);
  }

  private async receptorDe(u: UnidadFacturacion, empresaId: string, dte: DteGuardado) {
    if (dte.documentoId) {
      const venta = await u.comercial.documento(empresaId, "venta", dte.documentoId);
      return venta.tercero ? u.terceroReceptor(empresaId, venta.tercero.id) : null;
    }
    const nota = await u.comercial.nota(empresaId, dte.notaId!);
    return nota.tercero ? u.terceroReceptor(empresaId, nota.tercero.id) : null;
  }

  /** Contabiliza la partida si está en borrador y registra su reversión, dejando la original anulada. */
  private async revertirPartida(
    u: UnidadFacturacion,
    empresaId: string,
    partidaId: string,
    fecha: string,
    concepto: string,
  ): Promise<void> {
    const original = await u.anulacion.bloquear(empresaId, partidaId);
    if (!original) throw new ReglaDteError("No se encontró la partida del documento.");
    if (original.estado === "anulada") return;
    // Un borrador se contabiliza primero: la reversión cita su número y el libro diario conserva ambas
    const numerada =
      original.estado === "borrador"
        ? { ...original, ...(await u.anulacion.contabilizar(original.id)) }
        : original;
    const reversionId = await u.anulacion.crearReversion(empresaId, {
      partidaRevertidaId: original.id,
      sucursalId: original.sucursalId,
      fecha: fecha < original.fecha ? original.fecha : fecha,
      concepto: conceptoDeReversion(numerada, concepto),
      documentoTipo: original.documentoTipo,
      documentoNumero: original.documentoNumero,
      lineas: lineasDeReversion(original.lineas),
    });
    await u.anulacion.contabilizar(reversionId);
    await u.anulacion.anular(original.id, concepto.slice(0, 300));
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
    const certificado = await u.certificados.porId(dte.certificadoId);
    const firmado = certificado ? verificarJws(dte.firma, certificado.certificadoPem) : null;
    // jsonb reordena las claves: se compara en forma canónica y se muestra el JSON tal como se firmó
    const firmaValida = firmado !== null && canonico(firmado) === canonico(dte.documento);
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
      documento: firmaValida ? (firmado as Record<string, unknown>) : dte.documento,
      respuesta: respuestaRecepcion(dte),
      enlaceConsulta: enlaceConsulta(dte.codigoGeneracion, dte.fechaEmision),
      firmaValida,
    };
  }
}
