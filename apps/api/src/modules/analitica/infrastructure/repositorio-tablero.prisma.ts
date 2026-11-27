import { Injectable } from "@nestjs/common";
import { comoUsuario, type Tx } from "@contable/db";
import { BaseDatos } from "../../../compartido/base-datos.js";
import { UnidadPrisma } from "../../reportes/infrastructure/repositorio-balanza.prisma.js";
import {
  PeriodoTableroNoEncontradoError,
  SinPermisoTableroError,
  SucursalTableroNoAutorizadaError,
  TableroEmpresaNoEncontradaError,
  type ConsultaTablero,
  type DatosTablero,
} from "../domain/tablero.js";
import type { RepositorioTablero } from "../domain/repositorio-tablero.js";

const fechaFinMes = (mes: string): string => {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio!, numero!, 0)).toISOString().slice(0, 10);
};

interface FilasMetricas {
  ventas: string;
  costo_ventas: string;
  gastos_operacion: string;
  costos_financieros: string;
  utilidad: string;
  efectivo: string;
}

interface FilaSemana {
  semana: number;
  ccf: string;
  factura: string;
}

interface FilaProducto {
  id: string;
  nombre: string;
  utilidad: string;
}

interface FilaCategoria {
  id: string;
  nombre: string;
  ventas: string;
  utilidad: string;
}

async function datosTablero(
  tx: Tx,
  usuarioId: string,
  empresaId: string,
  consulta: ConsultaTablero,
): Promise<DatosTablero> {
  const unidad = new UnidadPrisma(tx);
  const acceso = await unidad.acceso(usuarioId, empresaId);
  if (!acceso) throw new TableroEmpresaNoEncontradaError();
  if (!acceso.permisos.has("analitica.ver")) throw new SinPermisoTableroError();

  let sucursales: readonly string[] | null = acceso.todasSucursales ? null : acceso.sucursales;
  if (consulta.sucursalId) {
    const permitida = acceso.todasSucursales || acceso.sucursales.includes(consulta.sucursalId);
    if (!permitida || !(await unidad.existeSucursal(empresaId, consulta.sucursalId))) {
      throw new SucursalTableroNoAutorizadaError();
    }
    sucursales = [consulta.sucursalId];
  }

  const desde = `${consulta.mes}-01`;
  const hasta = fechaFinMes(consulta.mes);
  const ejercicio = await unidad.ejercicioDe(empresaId, desde);
  if (!ejercicio || hasta > ejercicio.fin) throw new PeriodoTableroNoEncontradoError(consulta.mes);

  const todas = sucursales === null;
  const ids = [...(sucursales ?? [])];
  const [metricas] = await tx.$queryRaw<FilasMetricas[]>`
    SELECT
      COALESCE(SUM(CASE WHEN c.codigo LIKE '51%' THEN d.haber - d.debe ELSE 0 END), 0)::text AS ventas,
      COALESCE(SUM(CASE WHEN c.codigo LIKE '41%' THEN d.debe - d.haber ELSE 0 END), 0)::text AS costo_ventas,
      COALESCE(SUM(CASE WHEN c.tipo = 'costos_gastos' AND c.codigo NOT LIKE '41%' AND c.codigo NOT LIKE '4203%' THEN d.debe - d.haber ELSE 0 END), 0)::text AS gastos_operacion,
      COALESCE(SUM(CASE WHEN c.tipo = 'costos_gastos' AND c.codigo LIKE '4203%' THEN d.debe - d.haber ELSE 0 END), 0)::text AS costos_financieros,
      COALESCE(SUM(CASE WHEN c.tipo IN ('ingresos', 'costos_gastos') THEN d.haber - d.debe ELSE 0 END), 0)::text AS utilidad,
      COALESCE((
        SELECT SUM(e.debe - e.haber)
        FROM partida_detalles e
        JOIN partidas q ON q.id = e.partida_id
        JOIN cuentas ce ON ce.id = e.cuenta_id
        WHERE q.empresa_id = ${empresaId}::uuid AND q.estado IN ('contabilizada', 'anulada')
          AND q.fecha <= ${hasta}::date AND ce.tipo = 'activo'
          AND ce.codigo LIKE '1101%'
          AND (${todas} OR q.sucursal_id = ANY(${ids}::uuid[]))
      ), 0)::text AS efectivo
    FROM partida_detalles d
    JOIN partidas p ON p.id = d.partida_id
    JOIN cuentas c ON c.id = d.cuenta_id
    WHERE p.empresa_id = ${empresaId}::uuid AND p.estado IN ('contabilizada', 'anulada')
      AND p.tipo <> 'cierre' AND p.fecha BETWEEN ${desde}::date AND ${hasta}::date
      AND (${todas} OR p.sucursal_id = ANY(${ids}::uuid[]))`;

  const semanas = await tx.$queryRaw<FilaSemana[]>`
    WITH ventas AS (
      SELECT d.fecha, d.tipo_documento::text AS tipo, d.total_gravado + d.total_exento + d.total_no_sujeto AS monto
      FROM documentos_comerciales d
      JOIN partidas p ON p.id = d.partida_id
      WHERE d.empresa_id = ${empresaId}::uuid AND d.operacion = 'venta'
        AND d.tipo_documento IN ('ccf', 'factura') AND p.estado = 'contabilizada'
        AND d.fecha BETWEEN ${desde}::date AND ${hasta}::date
        AND (${todas} OR d.sucursal_id = ANY(${ids}::uuid[]))
      UNION ALL
      SELECT n.fecha, d.tipo_documento::text,
        (n.total_gravado + n.total_exento + n.total_no_sujeto) * CASE WHEN n.tipo = 'credito' THEN -1 ELSE 1 END
      FROM notas_comerciales n
      JOIN partidas p ON p.id = n.partida_id
      JOIN documentos_comerciales d ON d.id = n.documento_id
      WHERE n.empresa_id = ${empresaId}::uuid AND n.operacion = 'venta'
        AND d.tipo_documento IN ('ccf', 'factura') AND p.estado = 'contabilizada'
        AND n.fecha BETWEEN ${desde}::date AND ${hasta}::date
        AND (${todas} OR n.sucursal_id = ANY(${ids}::uuid[]))
    )
    SELECT floor((extract(day FROM fecha) - 1) / 7)::int + 1 AS semana,
      COALESCE(SUM(monto) FILTER (WHERE tipo = 'ccf'), 0)::text AS ccf,
      COALESCE(SUM(monto) FILTER (WHERE tipo = 'factura'), 0)::text AS factura
    FROM ventas GROUP BY semana ORDER BY semana`;

  const lineasProducto = await tx.$queryRaw<FilaProducto[]>`
    WITH ventas AS (
      SELECT pr.id AS producto_id, pr.nombre,
        COALESCE(cp.id::text, 'sin-categoria') AS categoria_id,
        COALESCE(cp.nombre, 'Sin categoría') AS categoria,
        CASE WHEN d.tipo_documento = 'factura' AND l.clase_gravamen = 'gravada'
          THEN round(l.monto / 1.13, 2) ELSE l.monto END AS ventas,
        COALESCE(m.costo_total, 0) AS costo
      FROM documentos_comerciales d
      JOIN partidas p ON p.id = d.partida_id
      JOIN documentos_comerciales_lineas l ON l.documento_id = d.id AND l.empresa_id = d.empresa_id
      JOIN productos pr ON pr.id = l.producto_id
      LEFT JOIN categorias_producto cp ON cp.id = pr.categoria_id
      LEFT JOIN movimientos_inventario m ON m.id = l.movimiento_inventario_id
      WHERE d.empresa_id = ${empresaId}::uuid AND d.operacion = 'venta'
        AND p.estado = 'contabilizada' AND d.fecha BETWEEN ${desde}::date AND ${hasta}::date
        AND (${todas} OR d.sucursal_id = ANY(${ids}::uuid[]))
      UNION ALL
      SELECT pr.id, pr.nombre, COALESCE(cp.id::text, 'sin-categoria'), COALESCE(cp.nombre, 'Sin categoría'),
        (CASE WHEN d.tipo_documento = 'factura' AND l.clase_gravamen = 'gravada'
          THEN round(l.monto / 1.13, 2) ELSE l.monto END)
          * CASE WHEN n.tipo = 'credito' THEN -1 ELSE 1 END,
        COALESCE(m.costo_total, 0) * CASE WHEN n.tipo = 'credito' THEN -1 ELSE 1 END
      FROM notas_comerciales n
      JOIN partidas p ON p.id = n.partida_id
      JOIN documentos_comerciales d ON d.id = n.documento_id
      JOIN notas_comerciales_lineas l ON l.nota_id = n.id AND l.empresa_id = n.empresa_id
      JOIN productos pr ON pr.id = l.producto_id
      LEFT JOIN categorias_producto cp ON cp.id = pr.categoria_id
      LEFT JOIN movimientos_inventario m ON m.id = l.movimiento_inventario_id
      WHERE n.empresa_id = ${empresaId}::uuid AND n.operacion = 'venta'
        AND p.estado = 'contabilizada' AND n.fecha BETWEEN ${desde}::date AND ${hasta}::date
        AND (${todas} OR n.sucursal_id = ANY(${ids}::uuid[]))
    )
    SELECT producto_id::text AS id, nombre, SUM(ventas - costo)::numeric(14,2)::text AS utilidad
    FROM ventas GROUP BY producto_id, nombre ORDER BY SUM(ventas - costo) DESC, nombre LIMIT 8`;

  const categorias = await tx.$queryRaw<FilaCategoria[]>`
    WITH ventas AS (
      SELECT COALESCE(cp.id::text, 'sin-categoria') AS categoria_id,
        COALESCE(cp.nombre, 'Sin categoría') AS categoria,
        CASE WHEN d.tipo_documento = 'factura' AND l.clase_gravamen = 'gravada'
          THEN round(l.monto / 1.13, 2) ELSE l.monto END AS ventas,
        COALESCE(m.costo_total, 0) AS costo
      FROM documentos_comerciales d JOIN partidas p ON p.id = d.partida_id
      JOIN documentos_comerciales_lineas l ON l.documento_id = d.id AND l.empresa_id = d.empresa_id
      JOIN productos pr ON pr.id = l.producto_id
      LEFT JOIN categorias_producto cp ON cp.id = pr.categoria_id
      LEFT JOIN movimientos_inventario m ON m.id = l.movimiento_inventario_id
      WHERE d.empresa_id = ${empresaId}::uuid AND d.operacion = 'venta'
        AND p.estado = 'contabilizada' AND d.fecha BETWEEN ${desde}::date AND ${hasta}::date
        AND (${todas} OR d.sucursal_id = ANY(${ids}::uuid[]))
      UNION ALL
      SELECT COALESCE(cp.id::text, 'sin-categoria'), COALESCE(cp.nombre, 'Sin categoría'),
        (CASE WHEN d.tipo_documento = 'factura' AND l.clase_gravamen = 'gravada'
          THEN round(l.monto / 1.13, 2) ELSE l.monto END)
          * CASE WHEN n.tipo = 'credito' THEN -1 ELSE 1 END,
        COALESCE(m.costo_total, 0) * CASE WHEN n.tipo = 'credito' THEN -1 ELSE 1 END
      FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
      JOIN documentos_comerciales d ON d.id = n.documento_id
      JOIN notas_comerciales_lineas l ON l.nota_id = n.id AND l.empresa_id = n.empresa_id
      JOIN productos pr ON pr.id = l.producto_id
      LEFT JOIN categorias_producto cp ON cp.id = pr.categoria_id
      LEFT JOIN movimientos_inventario m ON m.id = l.movimiento_inventario_id
      WHERE n.empresa_id = ${empresaId}::uuid AND n.operacion = 'venta'
        AND p.estado = 'contabilizada' AND n.fecha BETWEEN ${desde}::date AND ${hasta}::date
        AND (${todas} OR n.sucursal_id = ANY(${ids}::uuid[]))
    )
    SELECT categoria_id AS id, categoria AS nombre, SUM(ventas)::numeric(14,2)::text AS ventas,
      SUM(ventas - costo)::numeric(14,2)::text AS utilidad
    FROM ventas GROUP BY categoria_id, categoria ORDER BY categoria`;

  return {
    ventasNetas: metricas?.ventas ?? "0.00",
    costoVentas: metricas?.costo_ventas ?? "0.00",
    gastosOperacion: metricas?.gastos_operacion ?? "0.00",
    costosFinancieros: metricas?.costos_financieros ?? "0.00",
    utilidadEjercicio: metricas?.utilidad ?? "0.00",
    efectivo: metricas?.efectivo ?? "0.00",
    ventasSemanales: semanas.map((f) => ({
      semana: f.semana,
      comprobantesCreditoFiscal: f.ccf,
      consumidorFinal: f.factura,
    })),
    productos: lineasProducto.map((f) => ({ id: f.id, nombre: f.nombre, utilidadBruta: f.utilidad })),
    categorias: categorias.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      ventasNetas: f.ventas,
      utilidadBruta: f.utilidad,
    })),
  };
}

@Injectable()
export class RepositorioTableroPrisma implements RepositorioTablero {
  constructor(private readonly baseDatos: BaseDatos) {}

  consultar(usuarioId: string, empresaId: string, consulta: ConsultaTablero): Promise<DatosTablero> {
    return comoUsuario(this.baseDatos.prisma, usuarioId, (tx) =>
      datosTablero(tx, usuarioId, empresaId, consulta),
    );
  }
}
