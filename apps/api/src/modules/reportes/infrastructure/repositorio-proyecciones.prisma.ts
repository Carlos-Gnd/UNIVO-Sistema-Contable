import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { UnidadPrisma } from "./repositorio-balanza.prisma.js";
import { EmpresaNoEncontradaError, SinPermisoReportesError } from "../domain/balanza.js";
import type { MesHistoricoProyeccion } from "../domain/proyecciones.js";
import type { RepositorioProyecciones } from "../domain/repositorio-proyecciones.js";

interface FilaProyeccion {
  mes: string;
  ventas: string;
  gastos: string;
  flujo_efectivo: string;
  iva: string;
}

async function consultarHistorial(
  tx: Tx,
  usuarioId: string,
  empresaId: string,
): Promise<MesHistoricoProyeccion[]> {
  const unidad = new UnidadPrisma(tx);
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new EmpresaNoEncontradaError();
  if (!acceso.permisos.has("analitica.ver")) {
    throw new SinPermisoReportesError("Su rol no permite generar proyecciones financieras.");
  }
  const todas = acceso.todasSucursales;
  const sucursales = acceso.sucursales;
  const filas = await tx.$queryRaw<FilaProyeccion[]>`
    WITH movimientos AS (
      SELECT date_trunc('month', p.fecha)::date AS mes,
        CASE WHEN c.codigo LIKE '51%' THEN d.haber - d.debe ELSE 0 END AS ventas,
        CASE WHEN c.tipo = 'costos_gastos' THEN d.debe - d.haber ELSE 0 END AS gastos,
        CASE WHEN c.tipo = 'activo' AND (c.codigo LIKE '1101%' OR c.codigo LIKE '1102%')
          THEN d.debe - d.haber ELSE 0 END AS flujo_efectivo,
        CASE WHEN c.codigo LIKE '2109%' OR c.codigo LIKE '2110%' OR c.codigo LIKE '1112%' OR c.codigo LIKE '1113%'
          THEN d.haber - d.debe ELSE 0 END AS iva
      FROM partida_detalles d
      JOIN partidas p ON p.id = d.partida_id
      JOIN cuentas c ON c.id = d.cuenta_id
      WHERE p.empresa_id = ${empresaId}::uuid AND p.estado IN ('contabilizada', 'anulada')
        AND p.tipo <> 'cierre'
        AND (${todas} OR p.sucursal_id = ANY(${[...sucursales]}::uuid[]))
    ), agregados AS (
      SELECT mes, SUM(ventas) AS ventas, SUM(gastos) AS gastos,
        SUM(flujo_efectivo) AS flujo_efectivo, SUM(iva) AS iva
      FROM movimientos GROUP BY mes
    ), calendario AS (
      SELECT generate_series(MIN(mes), MAX(mes), interval '1 month')::date AS mes FROM agregados
    )
    SELECT to_char(c.mes, 'YYYY-MM') AS mes,
      COALESCE(a.ventas, 0)::text AS ventas, COALESCE(a.gastos, 0)::text AS gastos,
      COALESCE(a.flujo_efectivo, 0)::text AS flujo_efectivo, COALESCE(a.iva, 0)::text AS iva
    FROM calendario c LEFT JOIN agregados a ON a.mes = c.mes ORDER BY c.mes`;
  return filas.map((f) => ({
    mes: f.mes,
    ventas: f.ventas,
    gastos: f.gastos,
    flujoEfectivo: f.flujo_efectivo,
    iva: f.iva,
  }));
}

@Injectable()
export class RepositorioProyeccionesPrisma implements RepositorioProyecciones {
  constructor(private readonly baseDatos: BaseDatos) {}

  historial(usuarioId: string, empresaId: string): Promise<MesHistoricoProyeccion[]> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) =>
      consultarHistorial(tx, usuarioId, empresaId),
    );
  }
}
