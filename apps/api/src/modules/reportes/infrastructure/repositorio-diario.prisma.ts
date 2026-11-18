import { Injectable } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { ConsultaPartidasDiario, PartidaDiario } from "../domain/libro-diario.js";
import type { RepositorioDiario, UnidadDiario } from "../domain/repositorio-diario.js";
import { UnidadPrisma } from "./repositorio-balanza.prisma.js";

class UnidadDiarioPrisma extends UnidadPrisma implements UnidadDiario {
  /**
   * Una fila por partida con sus líneas en orden. La cuenta de mayor es la de los 4 primeros dígitos del
   * código; si la línea está en la propia cuenta de mayor, es ella misma.
   */
  async partidasDelDiario(c: ConsultaPartidasDiario): Promise<PartidaDiario[]> {
    const todas = c.sucursales === null;
    const todosLosTipos = c.tipo === null;
    return this.tx.$queryRaw<PartidaDiario[]>`
      SELECT p.id::text AS id, to_char(p.fecha, 'YYYY-MM-DD') AS fecha, p.tipo::text AS tipo, p.numero,
             p.estado::text AS estado, p.concepto,
             json_agg(json_build_object(
               'codigo', cu.codigo,
               'nombre', cu.nombre,
               'codigoMayor', left(cu.codigo, 4),
               'nombreMayor', COALESCE(ma.nombre, cu.nombre),
               'debe', d.debe::text,
               'haber', d.haber::text
             ) ORDER BY d.orden, d.id) AS lineas
      FROM partidas p
      JOIN partida_detalles d ON d.partida_id = p.id
      JOIN cuentas cu ON cu.id = d.cuenta_id
      LEFT JOIN cuentas ma ON ma.empresa_id = p.empresa_id AND ma.codigo = left(cu.codigo, 4)
      WHERE p.empresa_id = ${c.empresaId}::uuid
        AND p.estado IN ('contabilizada', 'anulada')
        AND p.fecha BETWEEN ${c.desde}::date AND ${c.hasta}::date
        AND (${todas} OR p.sucursal_id = ANY(${[...(c.sucursales ?? [])]}::uuid[]))
        AND (${todosLosTipos} OR p.tipo = ${c.tipo ?? "operacion"}::tipo_partida)
      GROUP BY p.id
      ORDER BY p.fecha, p.contabilizado_en, p.numero, p.id`;
  }
}

@Injectable()
export class RepositorioDiarioPrisma implements RepositorioDiario {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadDiario) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadDiarioPrisma(tx)));
  }
}
