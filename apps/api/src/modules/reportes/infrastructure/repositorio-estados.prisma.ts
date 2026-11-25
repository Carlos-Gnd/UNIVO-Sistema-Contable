import { Injectable } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { NombresDeMayor } from "../domain/estados.js";
import type { RepositorioEstados, UnidadEstados } from "../domain/repositorio-estados.js";
import { UnidadPrisma } from "./repositorio-balanza.prisma.js";

class UnidadEstadosPrisma extends UnidadPrisma implements UnidadEstados {
  async nombresDeMayor(empresaId: string, codigos: readonly string[]): Promise<NombresDeMayor> {
    if (codigos.length === 0) return new Map();
    const filas = await this.tx.cuenta.findMany({
      where: { empresaId, codigo: { in: [...codigos] } },
      select: { codigo: true, nombre: true },
    });
    return new Map(filas.map((f) => [f.codigo, f.nombre]));
  }

  async tipoContribuyente(empresaId: string): Promise<"persona_natural" | "sociedad"> {
    const e = await this.tx.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { tipoContribuyente: true },
    });
    return e.tipoContribuyente;
  }
}

@Injectable()
export class RepositorioEstadosPrisma implements RepositorioEstados {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEstados) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadEstadosPrisma(tx)));
  }
}
