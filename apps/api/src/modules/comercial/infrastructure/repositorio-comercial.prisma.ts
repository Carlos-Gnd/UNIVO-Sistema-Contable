import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { CrearTercero, EditarTercero, TerceroVista } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { mensajeDeRegla } from "../../../compartido/mensaje-regla-db.js";
import {
  ReglaComercialError,
  TerceroDuplicadoError,
  TerceroNoEncontradoError,
  type FiltroTerceros,
  type RepositorioComercial,
  type UnidadComercial,
} from "../domain/tercero.js";

/** Índice único que violó la operación (P2002), o null si es otro error; Postgres recorta el nombre del índice. */
export function campoDuplicado(error: unknown): "nit" | "nrc" | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return null;
  const detalle = JSON.stringify((error as { meta?: unknown }).meta ?? {});
  if (detalle.includes("terceros_empresa_id_nit")) return "nit";
  if (detalle.includes("terceros_empresa_id_nrc")) return "nrc";
  return null;
}

interface TerceroFila {
  id: string;
  nombre: string;
  nit: string;
  nrc: string | null;
  actividadEconomica: string | null;
  clasificacion: TerceroVista["clasificacion"];
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  diasCredito: number;
  activo: boolean;
}

export const terceroAVista = (t: TerceroFila): TerceroVista => ({
  id: t.id,
  nombre: t.nombre,
  nit: t.nit,
  nrc: t.nrc,
  actividadEconomica: t.actividadEconomica,
  clasificacion: t.clasificacion,
  direccion: t.direccion,
  telefono: t.telefono,
  correo: t.correo,
  esCliente: t.esCliente,
  esProveedor: t.esProveedor,
  diasCredito: t.diasCredito,
  activo: t.activo,
});

export class UnidadTerceros {
  constructor(protected readonly tx: Tx) {}

  async terceros(empresaId: string, filtro: FiltroTerceros): Promise<TerceroVista[]> {
    const texto = filtro.busqueda?.trim();
    const filas = await this.tx.tercero.findMany({
      where: {
        empresaId,
        ...(filtro.rol === "cliente" ? { esCliente: true } : {}),
        ...(filtro.rol === "proveedor" ? { esProveedor: true } : {}),
        ...(filtro.activo !== undefined ? { activo: filtro.activo } : {}),
        ...(texto
          ? {
              OR: [
                { nombre: { contains: texto, mode: "insensitive" as const } },
                { nit: { contains: texto } },
                { nrc: { contains: texto } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: "asc" },
    });
    return filas.map(terceroAVista);
  }

  async tercero(empresaId: string, terceroId: string): Promise<TerceroVista> {
    const t = await this.tx.tercero.findFirst({ where: { id: terceroId, empresaId } });
    if (!t) throw new TerceroNoEncontradoError();
    return terceroAVista(t);
  }

  async crearTercero(empresaId: string, datos: CrearTercero): Promise<TerceroVista> {
    try {
      const t = await this.tx.tercero.create({
        data: {
          empresaId,
          nombre: datos.nombre,
          nit: datos.nit,
          nrc: datos.nrc ?? null,
          actividadEconomica: datos.actividadEconomica ?? null,
          clasificacion: datos.clasificacion,
          direccion: datos.direccion ?? null,
          telefono: datos.telefono ?? null,
          correo: datos.correo ?? null,
          esCliente: datos.esCliente,
          esProveedor: datos.esProveedor,
          diasCredito: datos.diasCredito,
        },
      });
      return terceroAVista(t);
    } catch (e) {
      const campo = campoDuplicado(e);
      if (campo) throw new TerceroDuplicadoError(campo, campo === "nit" ? datos.nit : (datos.nrc ?? ""));
      throw e;
    }
  }

  async editarTercero(empresaId: string, terceroId: string, c: EditarTercero): Promise<TerceroVista> {
    const actual = await this.tx.tercero.findFirst({ where: { id: terceroId, empresaId } });
    if (!actual) throw new TerceroNoEncontradoError();
    const esCliente = c.esCliente ?? actual.esCliente;
    const esProveedor = c.esProveedor ?? actual.esProveedor;
    if (!esCliente && !esProveedor) {
      throw new ReglaComercialError("Marca al menos una opción: cliente o proveedor.");
    }
    try {
      const t = await this.tx.tercero.update({
        where: { id: terceroId },
        data: {
          ...(c.nombre !== undefined ? { nombre: c.nombre } : {}),
          ...(c.nit !== undefined ? { nit: c.nit } : {}),
          ...(c.nrc !== undefined ? { nrc: c.nrc } : {}),
          ...(c.actividadEconomica !== undefined ? { actividadEconomica: c.actividadEconomica } : {}),
          ...(c.clasificacion !== undefined ? { clasificacion: c.clasificacion } : {}),
          ...(c.direccion !== undefined ? { direccion: c.direccion } : {}),
          ...(c.telefono !== undefined ? { telefono: c.telefono } : {}),
          ...(c.correo !== undefined ? { correo: c.correo } : {}),
          ...(c.esCliente !== undefined ? { esCliente: c.esCliente } : {}),
          ...(c.esProveedor !== undefined ? { esProveedor: c.esProveedor } : {}),
          ...(c.diasCredito !== undefined ? { diasCredito: c.diasCredito } : {}),
          ...(c.activo !== undefined ? { activo: c.activo } : {}),
        },
      });
      return terceroAVista(t);
    } catch (e) {
      const campo = campoDuplicado(e);
      if (campo) {
        throw new TerceroDuplicadoError(campo, campo === "nit" ? (c.nit ?? actual.nit) : (c.nrc ?? ""));
      }
      throw e;
    }
  }
}

class UnidadPrisma extends UnidadTerceros implements UnidadComercial {}

@Injectable()
export class RepositorioComercialPrisma implements RepositorioComercial {
  constructor(private readonly baseDatos: BaseDatos) {}

  async enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadComercial) => Promise<T>): Promise<T> {
    try {
      return await comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
    } catch (e) {
      const regla = mensajeDeRegla(e);
      if (regla) throw new ReglaComercialError(regla);
      throw e;
    }
  }
}
