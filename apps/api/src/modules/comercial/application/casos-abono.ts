import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  Dinero,
  type AbonoResumen,
  type AbonoVista,
  type ConsultaAbonos,
  type ConsultaPendientes,
  type CrearAbono,
  type DocumentoPendiente,
} from "@contable/shared";
import { exigirSucursal } from "../../inventario/application/casos-kardex.js";
import { CUENTAS_COMERCIALES, DocumentoNoEncontradoError } from "../domain/documento.js";
import { REPOSITORIO_COMERCIAL, ReglaComercialError, type RepositorioComercial } from "../domain/tercero.js";
import { AbonoNoEncontradoError } from "../domain/abono.js";
import {
  exigirCuenta,
  exigirCuentaEfectivo,
  exigirPartidaValida,
  sucursalesVisibles,
} from "./casos-documento.js";

const TIPOS: Record<"ccf" | "factura" | "exportacion", string> = {
  ccf: "CCF",
  factura: "factura",
  exportacion: "factura de exportación",
};

/**
 * Abonos de cuentas por cobrar y por pagar (HU-62): un cobro o pago se reparte entre uno o varios documentos al crédito
 * de un mismo cliente o proveedor, parcial o totalmente, y genera su partida en borrador contra caja o bancos.
 * El permiso (operaciones.ver u operaciones.registrar) lo exige el controlador.
 */
@Injectable()
export class CasosAbono {
  constructor(@Inject(REPOSITORIO_COMERCIAL) private readonly repositorio: RepositorioComercial) {}

  registrar(usuarioId: string, empresaId: string, datos: CrearAbono): Promise<AbonoVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      await exigirSucursal(u.inventario, usuarioId, empresaId, datos.sucursalId);
      const cobro = datos.operacion === "venta";
      const tercero = await u.datosTerceroDocumento(empresaId, datos.terceroId);
      if (cobro ? !tercero.esCliente : !tercero.esProveedor) {
        throw new ReglaComercialError(`El tercero elegido no es un ${cobro ? "cliente" : "proveedor"}.`);
      }
      await exigirCuentaEfectivo(u, empresaId, datos.cuentaPagoId);

      const docs = await u.documentosParaAbono(
        empresaId,
        datos.aplicaciones.map((a) => a.documentoId),
      );
      for (const a of datos.aplicaciones) {
        const d = docs.find((x) => x.id === a.documentoId);
        if (!d) throw new DocumentoNoEncontradoError();
        const nombre = `${TIPOS[d.tipoDocumento]} ${d.numeroDocumento}`;
        if (d.operacion !== datos.operacion || d.terceroId !== tercero.id) {
          throw new ReglaComercialError(`El documento ${nombre} no es de ${tercero.nombre}.`);
        }
        if (d.condicionPago !== "credito") {
          throw new ReglaComercialError(`El documento ${nombre} fue al contado: no tiene saldo.`);
        }
        if (d.estadoPartida === "anulada") {
          throw new ReglaComercialError(`El documento ${nombre} tiene su partida anulada.`);
        }
        if (datos.fecha < d.fecha) {
          throw new ReglaComercialError(`El abono no puede ser anterior al documento ${nombre}.`);
        }
        if (Dinero.de(a.monto).mayorQue(d.saldo)) {
          throw new ReglaComercialError(
            `El abono a ${nombre} (${a.monto}) supera su saldo pendiente (${d.saldo}).`,
          );
        }
      }

      const monto = Dinero.sumar(datos.aplicaciones.map((a) => a.monto)).aTexto();
      const contrapartida = await exigirCuenta(
        u,
        empresaId,
        cobro ? CUENTAS_COMERCIALES.cuentasPorCobrar : CUENTAS_COMERCIALES.cuentasPorPagar,
      );
      const numeros = datos.aplicaciones
        .map((a) => docs.find((d) => d.id === a.documentoId)!)
        .map((d) => `${TIPOS[d.tipoDocumento]} ${d.numeroDocumento}`)
        .join(", ");
      const concepto = `${cobro ? "Cobro a" : "Pago a"} ${tercero.nombre} según ${numeros}`;
      const lineas = cobro
        ? [
            { cuentaId: datos.cuentaPagoId, debe: monto, haber: "0.00", concepto },
            { cuentaId: contrapartida.id, debe: "0.00", haber: monto, concepto },
          ]
        : [
            { cuentaId: contrapartida.id, debe: monto, haber: "0.00", concepto },
            { cuentaId: datos.cuentaPagoId, debe: "0.00", haber: monto, concepto },
          ];
      await exigirPartidaValida(u, empresaId, lineas);

      const id = randomUUID();
      const partidaId = await u.crearPartidaBorrador({
        empresaId,
        sucursalId: datos.sucursalId,
        usuarioId,
        fecha: datos.fecha,
        concepto,
        documentoTipo: cobro ? "COBRO" : "PAGO",
        documentoNumero: datos.referencia ?? numeros.slice(0, 60),
        origen: "abonos",
        origenId: id,
        lineas,
      });
      await u.crearAbono({
        id,
        empresaId,
        sucursalId: datos.sucursalId,
        operacion: datos.operacion,
        terceroId: tercero.id,
        fecha: datos.fecha,
        referencia: datos.referencia ?? null,
        cuentaPagoId: datos.cuentaPagoId,
        monto,
        partidaId,
        observaciones: datos.observaciones ?? null,
        usuarioId,
        aplicaciones: datos.aplicaciones.map((a) => ({ documentoId: a.documentoId, monto: a.monto })),
      });
      return u.abono(empresaId, id);
    });
  }

  listar(usuarioId: string, empresaId: string, consulta: ConsultaAbonos): Promise<AbonoResumen[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      return u.abonos(empresaId, { ...consulta, sucursales });
    });
  }

  ver(usuarioId: string, empresaId: string, abonoId: string): Promise<AbonoVista> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      const abono = await u.abono(empresaId, abonoId);
      if (sucursales && !sucursales.includes(abono.sucursalId)) throw new AbonoNoEncontradoError();
      return abono;
    });
  }

  pendientes(
    usuarioId: string,
    empresaId: string,
    consulta: ConsultaPendientes,
  ): Promise<DocumentoPendiente[]> {
    return this.repositorio.enTransaccion(usuarioId, async (u) => {
      const sucursales = await sucursalesVisibles(u, usuarioId, empresaId);
      return u.pendientes(empresaId, { ...consulta, sucursales });
    });
  }
}
