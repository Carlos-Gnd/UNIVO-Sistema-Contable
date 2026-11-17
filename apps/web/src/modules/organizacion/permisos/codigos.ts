/**
 * Permisos de la matriz (módulo.acción), los mismos de la migración 20261110000200_roles_y_permisos.
 * Tiparlos evita errores de escritura al ocultar opciones: usePermiso("partidas.contabilisar") no compila.
 */
export const PERMISOS = [
  "empresa.ver",
  "empresa.configurar",
  "sucursales.ver",
  "sucursales.gestionar",
  "usuarios.gestionar",
  "bitacora.ver",
  "bitacora.exportar",
  "respaldo.crear",
  "respaldo.restaurar",
  "catalogo.ver",
  "catalogo.editar",
  "catalogo.inactivar",
  "catalogo.importar",
  "partidas.ver",
  "partidas.registrar",
  "partidas.contabilizar",
  "partidas.editar_contabilizada",
  "partidas.anular",
  "ajustes.generar",
  "periodos.cerrar",
  "periodos.reabrir",
  "reportes.ver",
  "reportes.exportar",
  "estados.ver",
  "estados.exportar",
  "estados.firmar",
  "analitica.ver",
  "analitica.exportar",
  "iva.ver",
  "iva.exportar",
  "declaraciones.ver",
  "declaraciones.generar",
  "declaraciones.exportar",
  "dte.ver",
  "dte.emitir",
  "dte.invalidar",
  "terceros.ver",
  "terceros.registrar",
  "operaciones.ver",
  "operaciones.registrar",
  "inventario.ver",
  "inventario.registrar",
  "inventario.contar",
  "inventario.aprobar_ajuste",
  "tesoreria.ver",
  "tesoreria.registrar",
  "tesoreria.conciliar",
  "activo_fijo.ver",
  "activo_fijo.registrar",
  "planilla.ver",
  "planilla.calcular",
  "planilla.exportar",
] as const;

export type CodigoPermiso = (typeof PERMISOS)[number];

export type Rol = "administrador" | "contador" | "auxiliar" | "consulta";

export const NOMBRE_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  contador: "Contador",
  auxiliar: "Auxiliar contable",
  consulta: "Solo consulta",
};

const CONOCIDOS: ReadonlySet<string> = new Set(PERMISOS);

export const esCodigoPermiso = (valor: string): valor is CodigoPermiso => CONOCIDOS.has(valor);

/**
 * Permisos del usuario actual en una empresa, como los devuelve la API (S1-T55):
 * GET /empresas/:empresaId/mis-permisos
 */
export interface PermisosUsuario {
  rol: Rol;
  /** Administrador y contador trabajan con todas las sucursales */
  todasSucursales: boolean;
  /** Sucursales asignadas cuando todasSucursales es false (auxiliar y consulta) */
  sucursales: string[];
  permisos: string[];
}
