import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  Dinero,
  cantidadIgual,
  cantidadMayor,
  calcularTotalesNota,
  costoTotalDeEntrada,
  costoUnitarioDeTotal,
  restarCantidades,
  type ClaseGravamen,
  type CrearNota,
  type DisponibleNota,
  type NotaComercialResumen,
  type NotaComercialVista,
  type OperacionComercial,
  type ConsultaNotas,
} from "@contable/shared";
import { exigirSucursal, registrarMovimientoKardex } from "../../inventario/application/casos-kardex.js";
import {
  CUENTAS_COMERCIALES,
  DocumentoNoEncontradoError,
  armarPartidaCompra,
  armarPartidaCosto,
  armarPartidaVenta,
  creditosDeVenta,
} from "../domain/documento.js";
import {
  NOMBRE_MOTIVO,
  NOMBRE_NOTA,
  NotaDuplicadaError,
  invertirPartida,
  type LineaNotaGuardar,
} from "../domain/nota.js";
import { REPOSITORIO_COMERCIAL, ReglaComercialError, type RepositorioComercial } from "../domain/tercero.js";
import {
  cuentaDeVentas,
  exigirCuenta,
  exigirCuentaEfectivo,
  exigirPartidaValida,
  sucursalesVisibles,
} from "./casos-documento.js";

const mayor = (a: string, b: string) => Dinero.de(a).mayorQue(b);

/**
 * Devoluciones y rebajas (HU-61): una nota de crédito corrige un documento de compra o venta, una de débito le agrega
 * un cargo. Cada nota actualiza en un solo paso el kardex (devolución), el IVA, el saldo por cobrar o por pagar y deja
 * su partida en borrador (más la del costo de ventas si se devuelve mercadería vendida con inventario perpetuo).
 */
@Injectable()
export class CasosNota {
  constructor(@Inject(REPOSITORIO_COMERCIAL) private readonly repositorio: RepositorioComercial) {}

  registrar(usuarioId: string, empresaId: string, datos: CrearNota): Promise<NotaComercialVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const doc = await u.documentoParaNota(empresaId, datos.documentoId);
      await exigirSucursal(u.inventario, usuarioId, empresaId, doc.sucursalId);
      if (doc.estadoPartida === "anulada") {
        throw new ReglaComercialError("El documento tiene su partida anulada: no admite notas.");
      }
      if (datos.fecha < doc.fecha) {
        throw new ReglaComercialError("La nota no puede ser anterior al documento que corrige.");
      }
      if (
        await u.notaRegistrada(
          empresaId,
          doc.operacion,
          datos.tipo,
          doc.tercero?.id ?? null,
          datos.numeroNota,
        )
      ) {
        throw new NotaDuplicadaError(datos.tipo, datos.numeroNota);
      }
      if (doc.condicionPago === "contado") {
        if (!datos.cuentaPagoId) {
          throw new ReglaComercialError(
            "El documento fue al contado: elige la caja o el banco del reembolso o cobro.",
          );
        }
        await exigirCuentaEfectivo(u, empresaId, datos.cuentaPagoId);
      } else if (datos.cuentaPagoId) {
        throw new ReglaComercialError(
          "El documento fue al crédito: la nota se aplica a su saldo, sin caja ni banco.",
        );
      }

      const compra = doc.operacion === "compra";
      const params = await u.parametros(empresaId);
      const acumulado = await u.acumuladoNotas(doc.id);
      const idNota = randomUUID();
      const guardar: LineaNotaGuardar[] = [];
      /** Contrapartida contable de cada línea: la cuenta de ventas, de inventario o compras, o la cuenta de la línea */
      const cuentasLinea: { cuentaId: string; monto: string; clase: ClaseGravamen }[] = [];
      const costos: string[] = [];

      const cuentaProducto = compra
        ? await exigirCuenta(
            u,
            empresaId,
            params.sistemaInventario === "perpetuo"
              ? CUENTAS_COMERCIALES.inventario
              : CUENTAS_COMERCIALES.compras,
          )
        : await cuentaDeVentas(u, empresaId, doc.tipoDocumento);

      if (datos.motivo === "cargo") {
        const info = await u.cuentasInfo(
          empresaId,
          datos.lineas.map((l) => l.cuentaId!),
        );
        for (const [i, l] of datos.lineas.entries()) {
          const cuenta = info.find((c) => c.id === l.cuentaId);
          if (!cuenta || !cuenta.activa || !cuenta.imputable) {
            throw new ReglaComercialError(
              "Elige una cuenta contable activa y de último nivel para el cargo.",
            );
          }
          const clase = doc.tipoDocumento === "exportacion" ? "exenta" : l.clase;
          const monto = Dinero.de(l.monto!).aTexto();
          cuentasLinea.push({ cuentaId: cuenta.id, monto, clase });
          guardar.push({
            orden: i + 1,
            lineaDocumentoId: null,
            productoId: null,
            cuentaId: cuenta.id,
            descripcion: l.descripcion ?? "Cargo adicional",
            clase,
            cantidad: "0.0000",
            precioUnitario: "0.0000",
            monto,
            movimientoInventarioId: null,
          });
        }
      } else {
        const usadas = new Set<number>();
        for (const [i, l] of datos.lineas.entries()) {
          const orig = doc.lineas.find((x) => x.orden === l.lineaOrden);
          if (!orig) throw new ReglaComercialError(`El documento no tiene la línea ${l.lineaOrden}.`);
          if (usadas.has(orig.orden)) {
            throw new ReglaComercialError(`La línea ${orig.orden} del documento está repetida en la nota.`);
          }
          usadas.add(orig.orden);
          const ya = acumulado.get(orig.id) ?? { cantidad: "0", monto: "0" };
          const cantidadDisponible = restarCantidades(orig.cantidad, ya.cantidad);
          const montoDisponible = Dinero.de(orig.monto).menos(ya.monto);

          let monto: string;
          let cantidad = "0.0000";
          let movimientoId: string | null = null;
          if (datos.motivo === "devolucion") {
            if (!orig.productoId) {
              throw new ReglaComercialError(
                `La línea ${orig.orden} no es de un producto: solo se puede rebajar, no devolver.`,
              );
            }
            cantidad = l.cantidad!;
            if (cantidadMayor(cantidad, cantidadDisponible)) {
              throw new ReglaComercialError(
                `No se pueden devolver ${Number(cantidad)} unidades de «${orig.descripcion}»: quedan ${Number(cantidadDisponible)} por devolver.`,
              );
            }
            // La última devolución se lleva el centavo que dejó el redondeo
            monto = cantidadIgual(cantidad, cantidadDisponible)
              ? montoDisponible.aTexto()
              : costoTotalDeEntrada(cantidad, orig.precioUnitario);
            if (montoDisponible.menos(monto).esNegativo()) monto = montoDisponible.aTexto();
          } else {
            monto = Dinero.de(l.monto!).aTexto();
            if (Dinero.de(monto).menos(montoDisponible).mayorQue(0)) {
              throw new ReglaComercialError(
                `La rebaja de «${orig.descripcion}» supera lo que queda de la línea (${montoDisponible.aTexto()}).`,
              );
            }
          }

          if (datos.motivo === "devolucion") {
            // El inventario regresa (venta) o sale (compra) por el kardex de la sucursal del documento
            if (compra) {
              const mov = await registrarMovimientoKardex(u.inventario, usuarioId, empresaId, {
                productoId: orig.productoId!,
                sucursalId: doc.sucursalId,
                fecha: datos.fecha,
                tipo: "salida",
                cantidad,
                referencia: datos.numeroNota,
                ...(l.series ? { series: l.series } : {}),
              });
              movimientoId = mov.id;
            } else {
              if (orig.controlaSeries) {
                throw new ReglaComercialError(
                  `«${orig.descripcion}» se controla por serie: las unidades vendidas no se reingresan con una devolución. Registra una rebaja.`,
                );
              }
              if (orig.costoKardex === null) {
                throw new ReglaComercialError(
                  `La línea ${orig.orden} no tiene costo de ventas en el kardex.`,
                );
              }
              const mov = await registrarMovimientoKardex(u.inventario, usuarioId, empresaId, {
                productoId: orig.productoId!,
                sucursalId: doc.sucursalId,
                fecha: datos.fecha,
                tipo: "entrada",
                cantidad,
                // Regresa al costo con el que salió, no al precio de venta
                costoUnitario: costoUnitarioDeTotal(orig.costoKardex, orig.cantidad),
                referencia: datos.numeroNota,
              });
              movimientoId = mov.id;
              costos.push(mov.costoTotal);
            }
          }

          const cuentaId = orig.productoId ? cuentaProducto.id : orig.cuentaId!;
          cuentasLinea.push({ cuentaId, monto, clase: orig.clase });
          guardar.push({
            orden: i + 1,
            lineaDocumentoId: orig.id,
            productoId: orig.productoId,
            cuentaId: orig.productoId ? null : orig.cuentaId,
            descripcion: orig.descripcion,
            clase: orig.clase,
            cantidad,
            precioUnitario: orig.precioUnitario,
            monto,
            movimientoInventarioId: movimientoId,
          });
        }
      }

      const totales = calcularTotalesNota(
        {
          operacion: doc.operacion,
          tipoDocumento: doc.tipoDocumento,
          lineas: guardar.map((l) => ({ monto: l.monto, clase: l.clase, bien: l.productoId !== null })),
          empresa: params.clasificacion,
          tercero: doc.tercero?.clasificacion ?? "otro",
        },
        doc,
      );
      if (Dinero.de(totales.total).esCero()) throw new ReglaComercialError("La nota no tiene valor.");
      if (datos.tipo === "credito" && doc.condicionPago === "credito") {
        const saldo = await u.saldoDocumento(doc.id);
        if (mayor(totales.totalNeto, saldo)) {
          throw new ReglaComercialError(
            `La nota de crédito (${totales.totalNeto}) supera el saldo pendiente del documento (${saldo}).`,
          );
        }
      }

      const contrapartidaId =
        doc.condicionPago === "contado"
          ? datos.cuentaPagoId!
          : (
              await exigirCuenta(
                u,
                empresaId,
                compra ? CUENTAS_COMERCIALES.cuentasPorPagar : CUENTAS_COMERCIALES.cuentasPorCobrar,
              )
            ).id;
      const iva = Dinero.de(totales.iva).esCero() ? null : totales.iva;
      const percibido = Dinero.de(totales.ivaPercibido).esCero() ? null : totales.ivaPercibido;
      const retenido = Dinero.de(totales.ivaRetenido).esCero() ? null : totales.ivaRetenido;

      const nombre = NOMBRE_NOTA[datos.tipo];
      const tipoDoc =
        doc.tipoDocumento === "ccf"
          ? "CCF"
          : doc.tipoDocumento === "factura"
            ? "factura"
            : "factura de exportación";
      const concepto = `${nombre[0]!.toUpperCase()}${nombre.slice(1)} ${datos.numeroNota} por ${NOMBRE_MOTIVO[datos.motivo]} sobre ${tipoDoc} ${doc.numeroDocumento}${doc.tercero ? ` de ${doc.tercero.nombre}` : ""}`;

      let lineasPartida;
      if (compra) {
        const base = armarPartidaCompra(
          cuentasLinea,
          totales,
          {
            contrapartidaId,
            ...(iva
              ? { creditoFiscalId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.creditoFiscal)).id }
              : {}),
            ...(percibido
              ? {
                  ivaPercibidoId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.ivaPercibidoActivo))
                    .id,
                }
              : {}),
            ...(retenido
              ? {
                  ivaRetenidoId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.ivaRetenidoPasivo)).id,
                }
              : {}),
          },
          concepto,
        );
        lineasPartida = datos.tipo === "credito" ? invertirPartida(base) : base;
      } else {
        const base = armarPartidaVenta(
          creditosDeVenta(cuentasLinea, doc.tipoDocumento, totales),
          totales,
          {
            cobroId: contrapartidaId,
            ...(iva
              ? { debitoFiscalId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.debitoFiscal)).id }
              : {}),
            ...(percibido
              ? {
                  ivaPercibidoId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.ivaPercibidoPasivo))
                    .id,
                }
              : {}),
            ...(retenido
              ? {
                  ivaRetenidoId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.ivaRetenidoActivo)).id,
                }
              : {}),
          },
          concepto,
        );
        lineasPartida = datos.tipo === "credito" ? invertirPartida(base) : base;
      }
      await exigirPartidaValida(u, empresaId, lineasPartida);
      const documentoTipo = datos.tipo === "credito" ? "NC" : "ND";
      const partidaId = await u.crearPartidaBorrador({
        empresaId,
        sucursalId: doc.sucursalId,
        usuarioId,
        fecha: datos.fecha,
        concepto,
        documentoTipo,
        documentoNumero: datos.numeroNota,
        origen: "notas",
        origenId: idNota,
        lineas: lineasPartida,
      });

      // Mercadería vendida que regresa: el costo vuelve de costo de ventas a inventarios (inventario perpetuo)
      let partidaCostoId: string | null = null;
      const costoTotal = Dinero.sumar(costos);
      if (params.sistemaInventario === "perpetuo" && !costoTotal.esCero()) {
        const conceptoCosto = `Costo de la mercadería devuelta según ${nombre} ${datos.numeroNota} (kardex)`;
        const lineasCosto = invertirPartida(
          armarPartidaCosto(
            costoTotal.aTexto(),
            {
              costoVentasId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.costoVentas)).id,
              inventarioId: (await exigirCuenta(u, empresaId, CUENTAS_COMERCIALES.inventario)).id,
            },
            conceptoCosto,
          ),
        );
        await exigirPartidaValida(u, empresaId, lineasCosto);
        partidaCostoId = await u.crearPartidaBorrador({
          empresaId,
          sucursalId: doc.sucursalId,
          usuarioId,
          fecha: datos.fecha,
          concepto: conceptoCosto,
          documentoTipo,
          documentoNumero: datos.numeroNota,
          origen: "notas_costo",
          origenId: idNota,
          lineas: lineasCosto,
        });
      }

      await u.crearNota({
        id: idNota,
        empresaId,
        sucursalId: doc.sucursalId,
        documentoId: doc.id,
        operacion: doc.operacion,
        tipo: datos.tipo,
        motivo: datos.motivo,
        numeroNota: datos.numeroNota,
        fecha: datos.fecha,
        terceroId: doc.tercero?.id ?? null,
        cuentaPagoId: doc.condicionPago === "contado" ? datos.cuentaPagoId! : null,
        totales,
        partidaId,
        partidaCostoId,
        observaciones: datos.observaciones ?? null,
        usuarioId,
        lineas: guardar,
      });
      return u.nota(empresaId, idNota);
    });
  }

  listar(usuarioId: string, empresaId: string, consulta: ConsultaNotas): Promise<NotaComercialResumen[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      return u.notas(empresaId, { ...consulta, sucursales });
    });
  }

  ver(usuarioId: string, empresaId: string, notaId: string): Promise<NotaComercialVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      const nota = await u.nota(empresaId, notaId);
      if (sucursales) {
        const doc = await u.documentoParaNota(empresaId, nota.documento.id);
        if (!sucursales.includes(doc.sucursalId)) throw new DocumentoNoEncontradoError();
      }
      return nota;
    });
  }

  /** Lo que todavía se puede devolver o rebajar de cada línea de un documento y su saldo pendiente. */
  disponible(
    usuarioId: string,
    empresaId: string,
    operacion: OperacionComercial,
    documentoId: string,
  ): Promise<DisponibleNota> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      const doc = await u.documentoParaNota(empresaId, documentoId);
      if (doc.operacion !== operacion || (sucursales && !sucursales.includes(doc.sucursalId))) {
        throw new DocumentoNoEncontradoError();
      }
      const acumulado = await u.acumuladoNotas(doc.id);
      return {
        documentoId: doc.id,
        saldo: doc.condicionPago === "credito" ? await u.saldoDocumento(doc.id) : "0.00",
        lineas: doc.lineas.map((l) => {
          const ya = acumulado.get(l.id) ?? { cantidad: "0", monto: "0" };
          return {
            orden: l.orden,
            productoId: l.productoId,
            productoCodigo: l.productoCodigo,
            descripcion: l.descripcion,
            clase: l.clase,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            monto: l.monto,
            cantidadDisponible: restarCantidades(l.cantidad, ya.cantidad),
            montoDisponible: Dinero.de(l.monto).menos(ya.monto).aTexto(),
          };
        }),
      };
    });
  }
}
