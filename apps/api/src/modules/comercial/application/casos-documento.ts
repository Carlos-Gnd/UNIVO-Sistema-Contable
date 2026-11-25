import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  Dinero,
  calcularTotalesDocumento,
  costoTotalDeEntrada,
  validarPartida,
  type ConsultaDocumentos,
  type CrearCompra,
  type DocumentoComercialResumen,
  type DocumentoComercialVista,
  type LineaPartida,
  type OperacionComercial,
} from "@contable/shared";
import { exigirSucursal, registrarMovimientoKardex } from "../../inventario/application/casos-kardex.js";
import {
  CUENTAS_COMERCIALES,
  DocumentoDuplicadoError,
  DocumentoNoEncontradoError,
  armarPartidaCompra,
  sumarDias,
  type CuentaResuelta,
  type LineaDocumentoGuardar,
} from "../domain/documento.js";
import {
  REPOSITORIO_COMERCIAL,
  ReglaComercialError,
  type RepositorioComercial,
  type UnidadComercial,
} from "../domain/tercero.js";

/** Cuenta del catálogo de la empresa para un código comercial, o un error claro si falta. */
export async function exigirCuenta(
  unidad: UnidadComercial,
  empresaId: string,
  codigo: string,
): Promise<CuentaResuelta> {
  const cuenta = await unidad.cuentaPorCodigo(empresaId, codigo);
  if (!cuenta) {
    throw new ReglaComercialError(
      `El catálogo de la empresa no tiene la cuenta ${codigo} que necesita el registro.`,
    );
  }
  return cuenta;
}

/** Valida la partida con las reglas del dominio de contabilidad antes de guardarla (la base la vuelve a verificar). */
export async function exigirPartidaValida(
  unidad: UnidadComercial,
  empresaId: string,
  lineas: readonly LineaPartida[],
): Promise<void> {
  const cuentas = new Map(
    (await unidad.cuentasInfo(empresaId, [...new Set(lineas.map((l) => l.cuentaId))])).map((c) => [c.id, c]),
  );
  const r = validarPartida([...lineas], cuentas);
  if (r.errores.length > 0) {
    throw new ReglaComercialError(`La partida generada no es válida: ${r.errores[0]!.mensaje}`);
  }
  if (!r.puedeContabilizarse) {
    throw new ReglaComercialError(`La partida generada no cuadra (diferencia de ${r.diferencia}).`);
  }
}

/** Cuenta de efectivo (1101…) elegida para el pago o cobro al contado. */
export async function exigirCuentaEfectivo(
  unidad: UnidadComercial,
  empresaId: string,
  cuentaId: string,
): Promise<void> {
  const [cuenta] = await unidad.cuentasInfo(empresaId, [cuentaId]);
  if (!cuenta || !cuenta.codigo.startsWith("1101") || !cuenta.activa || !cuenta.imputable) {
    throw new ReglaComercialError("Elige una cuenta de caja o banco de la empresa para el pago al contado.");
  }
}

/** Sucursales que el usuario puede ver; null si ve todas, o error si no es miembro. */
export async function sucursalesVisibles(
  unidad: UnidadComercial,
  usuarioId: string,
  empresaId: string,
): Promise<readonly string[] | null> {
  const acceso = await unidad.inventario.acceso(usuarioId, empresaId);
  if (!acceso) throw new DocumentoNoEncontradoError();
  return acceso.todasSucursales ? null : acceso.sucursales;
}

/**
 * Compras y ventas (HU-59, HU-60): cada registro actualiza en un solo paso el kardex, los totales de IVA, la cuenta
 * por pagar o por cobrar y una partida en borrador para que el contador la revise y contabilice. El permiso
 * (operaciones.ver u operaciones.registrar) lo exige el controlador.
 */
@Injectable()
export class CasosDocumento {
  constructor(@Inject(REPOSITORIO_COMERCIAL) private readonly repositorio: RepositorioComercial) {}

  /**
   * Registra una compra: entra el inventario al kardex con el costo del documento, se calculan el IVA (crédito
   * fiscal) y las retenciones o percepciones según la clasificación de la empresa y del proveedor, y se genera la
   * partida en borrador: al contado sale de caja o banco; al crédito queda en cuentas por pagar.
   */
  registrarCompra(
    usuarioId: string,
    empresaId: string,
    datos: CrearCompra,
  ): Promise<DocumentoComercialVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      await exigirSucursal(u.inventario, usuarioId, empresaId, datos.sucursalId);
      const proveedor = await u.datosTerceroDocumento(empresaId, datos.terceroId);
      if (!proveedor.esProveedor) throw new ReglaComercialError("El tercero elegido no es un proveedor.");
      if (!proveedor.activo) throw new ReglaComercialError("El proveedor está inactivo.");
      if (datos.tipoDocumento === "ccf" && !proveedor.nrc) {
        throw new ReglaComercialError(
          "El proveedor no tiene NRC: un comprobante de crédito fiscal lo exige. Complétalo en Clientes y proveedores.",
        );
      }
      if (
        await u.documentoRegistrado(
          empresaId,
          "compra",
          datos.tipoDocumento,
          proveedor.id,
          datos.numeroDocumento,
        )
      ) {
        throw new DocumentoDuplicadoError(datos.tipoDocumento, datos.numeroDocumento);
      }
      if (datos.condicionPago === "contado") await exigirCuentaEfectivo(u, empresaId, datos.cuentaPagoId!);

      const params = await u.parametros(empresaId);
      const inventarioCuenta = await exigirCuenta(
        u,
        empresaId,
        params.sistemaInventario === "perpetuo"
          ? CUENTAS_COMERCIALES.inventario
          : CUENTAS_COMERCIALES.compras,
      );

      // Cada línea con producto entra al kardex con el costo de la compra; las demás van a su cuenta contable
      const id = randomUUID();
      const guardar: LineaDocumentoGuardar[] = [];
      const debitos: { cuentaId: string; monto: string }[] = [];
      for (const [i, l] of datos.lineas.entries()) {
        let descripcion = l.descripcion ?? "Compra de bienes o servicios";
        let monto = costoTotalDeEntrada(l.cantidad, l.precioUnitario);
        let movimientoId: string | null = null;
        if (l.productoId) {
          const producto = await u.inventario.producto(empresaId, l.productoId);
          descripcion = l.descripcion ?? producto.nombre;
          const mov = await registrarMovimientoKardex(u.inventario, usuarioId, empresaId, {
            productoId: l.productoId,
            sucursalId: datos.sucursalId,
            fecha: datos.fecha,
            tipo: "entrada",
            cantidad: l.cantidad,
            costoUnitario: l.precioUnitario,
            referencia: datos.numeroDocumento,
            ...(l.series ? { series: l.series } : {}),
          });
          monto = mov.costoTotal;
          movimientoId = mov.id;
        }
        debitos.push({ cuentaId: l.productoId ? inventarioCuenta.id : l.cuentaId!, monto });
        guardar.push({
          orden: i + 1,
          productoId: l.productoId ?? null,
          cuentaId: l.cuentaId ?? null,
          descripcion,
          clase: l.clase,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          monto,
          movimientoInventarioId: movimientoId,
        });
      }

      const totales = calcularTotalesDocumento({
        operacion: "compra",
        tipoDocumento: datos.tipoDocumento,
        lineas: guardar.map((l) => ({ monto: l.monto, clase: l.clase })),
        empresa: params.clasificacion,
        tercero: proveedor.clasificacion,
      });
      if (Dinero.de(totales.total).esCero()) throw new ReglaComercialError("El documento no tiene valor.");

      const cuentas = {
        contrapartidaId:
          datos.condicionPago === "contado"
            ? datos.cuentaPagoId!
            : (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.cuentasPorPagar)).id,
        ...(Dinero.de(totales.iva).esCero()
          ? {}
          : { creditoFiscalId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.creditoFiscal)).id }),
        ...(Dinero.de(totales.ivaPercibido).esCero()
          ? {}
          : {
              ivaPercibidoId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.ivaPercibidoActivo)).id,
            }),
        ...(Dinero.de(totales.ivaRetenido).esCero()
          ? {}
          : { ivaRetenidoId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.ivaRetenidoPasivo)).id }),
      };
      const nombreTipo = datos.tipoDocumento === "ccf" ? "CCF" : "factura";
      const concepto = `Compra según ${nombreTipo} ${datos.numeroDocumento} de ${proveedor.nombre}`;
      const lineasPartida = armarPartidaCompra(debitos, totales, cuentas, concepto);
      await exigirPartidaValida(u, empresaId, lineasPartida);

      const partidaId = await u.crearPartidaBorrador({
        empresaId,
        sucursalId: datos.sucursalId,
        usuarioId,
        fecha: datos.fecha,
        concepto,
        documentoTipo: datos.tipoDocumento.toUpperCase(),
        documentoNumero: datos.numeroDocumento,
        origen: "compras",
        origenId: id,
        lineas: lineasPartida,
      });

      const dias = datos.condicionPago === "credito" ? (datos.diasCredito ?? proveedor.diasCredito) : 0;
      await u.crearDocumento({
        id,
        empresaId,
        sucursalId: datos.sucursalId,
        operacion: "compra",
        tipoDocumento: datos.tipoDocumento,
        numeroDocumento: datos.numeroDocumento,
        fecha: datos.fecha,
        terceroId: proveedor.id,
        condicionPago: datos.condicionPago,
        cuentaPagoId: datos.condicionPago === "contado" ? datos.cuentaPagoId! : null,
        diasCredito: dias,
        fechaVencimiento: datos.condicionPago === "credito" ? sumarDias(datos.fecha, dias) : null,
        totales,
        partidaId,
        observaciones: datos.observaciones ?? null,
        usuarioId,
        lineas: guardar,
      });
      return u.documento(empresaId, "compra", id);
    });
  }

  listar(
    usuarioId: string,
    empresaId: string,
    operacion: OperacionComercial,
    consulta: ConsultaDocumentos,
  ): Promise<DocumentoComercialResumen[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      return u.documentos(empresaId, { ...consulta, operacion, sucursales });
    });
  }

  ver(
    usuarioId: string,
    empresaId: string,
    operacion: OperacionComercial,
    documentoId: string,
  ): Promise<DocumentoComercialVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      const documento = await u.documento(empresaId, operacion, documentoId);
      if (sucursales && !sucursales.includes(documento.sucursalId)) throw new DocumentoNoEncontradoError();
      return documento;
    });
  }
}
