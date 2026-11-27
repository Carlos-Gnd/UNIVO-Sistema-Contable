import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import type { Obligacion } from "@contable/shared";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { Presentacion } from "../domain/calendario.js";
import type {
  AccesoCalendario,
  RepositorioCalendario,
  UnidadCalendario,
} from "../domain/repositorio-calendario.js";

interface FilaPresentacion {
  obligacion: Obligacion;
  periodo: string;
  presentada_en: string;
  nota: string | null;
}

const aPresentacion = (f: FilaPresentacion): Presentacion => ({
  obligacion: f.obligacion,
  periodo: f.periodo,
  presentadaEn: f.presentada_en,
  nota: f.nota,
});

class UnidadPrisma implements UnidadCalendario {
  constructor(private readonly tx: Tx) {}

  async acceso(usuarioId: string, empresaId: string): Promise<AccesoCalendario | null> {
    const [fila] = await this.tx.$queryRaw<{ permisos: string[] }[]>`
      SELECT ARRAY(SELECT pu.permiso FROM permisos_usuario pu
                   WHERE pu.usuario_id = m.usuario_id AND pu.empresa_id = m.empresa_id) AS permisos
      FROM membresias m
      JOIN usuarios u ON u.id = m.usuario_id AND u.activo
      WHERE m.usuario_id = ${usuarioId}::uuid AND m.empresa_id = ${empresaId}::uuid AND m.activa`;
    return fila ? { permisos: new Set(fila.permisos) } : null;
  }

  async presentaciones(empresaId: string, desde: string, hasta: string): Promise<Map<string, Presentacion>> {
    const filas = await this.tx.$queryRaw<FilaPresentacion[]>`
      SELECT obligacion, to_char(periodo, 'YYYY-MM') AS periodo, presentada_en::text, nota
      FROM presentaciones_tributarias
      WHERE empresa_id = ${empresaId}::uuid
        AND periodo BETWEEN (${desde} || '-01')::date AND (${hasta} || '-01')::date`;
    return new Map(filas.map((f) => [`${f.obligacion}:${f.periodo}`, aPresentacion(f)]));
  }

  async marcar(
    empresaId: string,
    usuarioId: string,
    obligacion: Obligacion,
    periodo: string,
    nota: string | null,
  ): Promise<Presentacion> {
    const [fila] = await this.tx.$queryRaw<FilaPresentacion[]>`
      INSERT INTO presentaciones_tributarias (empresa_id, obligacion, periodo, presentada_por, nota)
      VALUES (${empresaId}::uuid, ${obligacion}, (${periodo} || '-01')::date, ${usuarioId}::uuid, ${nota})
      ON CONFLICT (empresa_id, obligacion, periodo)
      DO UPDATE SET nota = EXCLUDED.nota, presentada_por = EXCLUDED.presentada_por
      RETURNING obligacion, to_char(periodo, 'YYYY-MM') AS periodo, presentada_en::text, nota`;
    if (!fila) throw new Error("La base no devolvió la constancia");
    return aPresentacion(fila);
  }

  async desmarcar(empresaId: string, obligacion: Obligacion, periodo: string): Promise<boolean> {
    const filas = await this.tx.$queryRaw<{ id: string }[]>`
      DELETE FROM presentaciones_tributarias
      WHERE empresa_id = ${empresaId}::uuid AND obligacion = ${obligacion} AND periodo = (${periodo} || '-01')::date
      RETURNING id::text`;
    return filas.length > 0;
  }
}

@Injectable()
export class RepositorioCalendarioPrisma implements RepositorioCalendario {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadCalendario) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadPrisma(tx)));
  }
}
