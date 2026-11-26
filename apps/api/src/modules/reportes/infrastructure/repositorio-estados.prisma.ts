import { Injectable } from "@nestjs/common";
import { comoUsuario } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import type { ClaveNota, VersionNota } from "@contable/shared";
import type { DatosEmpresaNotas, NotaGuardada } from "../domain/notas.js";
import type { NombresDeMayor } from "../domain/estados.js";
import type { ParametrosEstados, RepositorioEstados, UnidadEstados } from "../domain/repositorio-estados.js";
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

  async parametrosEstados(empresaId: string): Promise<ParametrosEstados> {
    return this.tx.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { tipoContribuyente: true, formatoEstados: true },
    });
  }

  async datosEmpresaNotas(empresaId: string): Promise<DatosEmpresaNotas> {
    const e = await this.tx.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: {
        nombre: true,
        nit: true,
        nrc: true,
        actividadEconomica: true,
        tipoContribuyente: true,
        formatoEstados: true,
        metodoValuacion: true,
        sistemaInventario: true,
      },
    });
    const sucursalesActivas = await this.tx.sucursal.count({ where: { empresaId, activa: true } });
    return { ...e, sucursalesActivas };
  }

  async anioDelEjercicio(empresaId: string, fecha: string): Promise<number | null> {
    const [fila] = await this.tx.$queryRaw<{ anio: number }[]>`
      SELECT anio::int AS anio FROM ejercicios
      WHERE empresa_id = ${empresaId}::uuid AND ${fecha}::date BETWEEN fecha_inicio AND fecha_fin`;
    return fila?.anio ?? null;
  }

  async notasVigentes(empresaId: string, fecha: string): Promise<Map<string, NotaGuardada>> {
    const filas = await this.tx.$queryRaw<{ clave: string; version: number; texto: string }[]>`
      SELECT DISTINCT ON (n.clave) n.clave, n.version, n.texto
      FROM notas_estados n
      JOIN ejercicios e ON e.id = n.ejercicio_id
      WHERE n.empresa_id = ${empresaId}::uuid AND ${fecha}::date BETWEEN e.fecha_inicio AND e.fecha_fin
      ORDER BY n.clave, n.version DESC`;
    return new Map(filas.map((f) => [f.clave, { version: f.version, texto: f.texto }]));
  }

  async versionesDeNota(empresaId: string, fecha: string, clave: ClaveNota): Promise<VersionNota[]> {
    const filas = await this.tx.$queryRaw<
      { version: number; texto: string; creado_en: Date; autor: string | null }[]
    >`
      SELECT n.version, n.texto, n.creado_en, u.nombre AS autor
      FROM notas_estados n
      JOIN ejercicios e ON e.id = n.ejercicio_id
      LEFT JOIN usuarios u ON u.id = n.creado_por
      WHERE n.empresa_id = ${empresaId}::uuid AND n.clave = ${clave}
        AND ${fecha}::date BETWEEN e.fecha_inicio AND e.fecha_fin
      ORDER BY n.version DESC`;
    return filas.map((f) => ({
      version: f.version,
      texto: f.texto,
      creadoEn: f.creado_en.toISOString(),
      autor: f.autor,
    }));
  }

  async guardarNota(empresaId: string, fecha: string, clave: ClaveNota, texto: string): Promise<number> {
    const [fila] = await this.tx.$queryRaw<{ version: number }[]>`
      INSERT INTO notas_estados (empresa_id, ejercicio_id, clave, texto)
      SELECT e.empresa_id, e.id, ${clave}, ${texto}
      FROM ejercicios e
      WHERE e.empresa_id = ${empresaId}::uuid AND ${fecha}::date BETWEEN e.fecha_inicio AND e.fecha_fin
      RETURNING version`;
    if (!fila) throw new Error("No hay un ejercicio que contenga la fecha.");
    return fila.version;
  }
}

@Injectable()
export class RepositorioEstadosPrisma implements RepositorioEstados {
  constructor(private readonly baseDatos: BaseDatos) {}

  enTransaccion<T>(usuarioId: string, fn: (unidad: UnidadEstados) => Promise<T>): Promise<T> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) => fn(new UnidadEstadosPrisma(tx)));
  }
}
