-- Roles y matriz de permisos (sección 5 del documento de requerimientos). HU-10, tarea S1-T53.
-- Son datos de referencia: van en una migración para que existan en todos los ambientes.

INSERT INTO roles (id, codigo, nombre) VALUES
  (1, 'administrador', 'Administrador'),
  (2, 'contador', 'Contador'),
  (3, 'auxiliar', 'Auxiliar contable'),
  (4, 'consulta', 'Solo consulta');

INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('empresa', 'ver', 'Ver los datos y la configuración de la empresa'),
  ('empresa', 'configurar', 'Editar datos, logotipo y parámetros contables de la empresa'),
  ('sucursales', 'ver', 'Ver sucursales'),
  ('sucursales', 'gestionar', 'Crear, editar e inactivar sucursales'),
  ('usuarios', 'gestionar', 'Invitar usuarios y asignar roles y sucursales'),
  ('bitacora', 'ver', 'Consultar la bitácora de auditoría'),
  ('bitacora', 'exportar', 'Exportar la bitácora'),
  ('respaldo', 'crear', 'Generar un respaldo de la empresa'),
  ('respaldo', 'restaurar', 'Restaurar un respaldo de la empresa'),
  ('catalogo', 'ver', 'Ver el catálogo de cuentas'),
  ('catalogo', 'editar', 'Crear y editar cuentas'),
  ('catalogo', 'inactivar', 'Inactivar cuentas'),
  ('catalogo', 'importar', 'Importar catálogo, saldos iniciales y productos desde Excel'),
  ('partidas', 'ver', 'Ver partidas'),
  ('partidas', 'registrar', 'Registrar y editar partidas en borrador'),
  ('partidas', 'contabilizar', 'Contabilizar partidas'),
  ('partidas', 'editar_contabilizada', 'Editar partidas contabilizadas de un período abierto'),
  ('partidas', 'anular', 'Anular partidas mediante reversión'),
  ('ajustes', 'generar', 'Generar ajustes automáticos (depreciación, provisiones, IVA)'),
  ('periodos', 'cerrar', 'Cerrar períodos y ejercicios y generar la reapertura'),
  ('periodos', 'reabrir', 'Reabrir un período cerrado'),
  ('reportes', 'ver', 'Ver libro diario, mayor, balanzas y hoja de trabajo'),
  ('reportes', 'exportar', 'Exportar libros y balanzas'),
  ('estados', 'ver', 'Ver estados financieros'),
  ('estados', 'exportar', 'Exportar estados financieros'),
  ('estados', 'firmar', 'Firmar digitalmente estados financieros'),
  ('analitica', 'ver', 'Ver tablero, gráficas y proyecciones'),
  ('analitica', 'exportar', 'Exportar tablero e indicadores'),
  ('iva', 'ver', 'Ver libros de IVA'),
  ('iva', 'exportar', 'Exportar libros de IVA'),
  ('declaraciones', 'ver', 'Ver liquidación de IVA, pago a cuenta, retenciones e ISR'),
  ('declaraciones', 'generar', 'Calcular declaraciones y generar sus partidas'),
  ('declaraciones', 'exportar', 'Exportar declaraciones y anexos'),
  ('dte', 'ver', 'Ver documentos tributarios electrónicos'),
  ('dte', 'emitir', 'Emitir DTE (factura, CCF, notas)'),
  ('dte', 'invalidar', 'Invalidar DTE'),
  ('terceros', 'ver', 'Ver clientes y proveedores'),
  ('terceros', 'registrar', 'Registrar y editar clientes y proveedores'),
  ('operaciones', 'ver', 'Ver compras, ventas y cuentas por cobrar y pagar'),
  ('operaciones', 'registrar', 'Registrar compras, ventas y abonos'),
  ('inventario', 'ver', 'Ver productos y kardex'),
  ('inventario', 'registrar', 'Registrar productos, entradas y salidas'),
  ('inventario', 'contar', 'Registrar la toma física'),
  ('inventario', 'aprobar_ajuste', 'Aprobar ajustes de inventario por toma física'),
  ('tesoreria', 'ver', 'Ver caja, caja chica y bancos'),
  ('tesoreria', 'registrar', 'Registrar movimientos de caja y bancos'),
  ('tesoreria', 'conciliar', 'Realizar la conciliación bancaria'),
  ('activo_fijo', 'ver', 'Ver activos fijos y depreciación'),
  ('activo_fijo', 'registrar', 'Registrar y dar de baja activos fijos'),
  ('planilla', 'ver', 'Ver planillas y empleados'),
  ('planilla', 'calcular', 'Calcular planillas, prestaciones y sus partidas'),
  ('planilla', 'exportar', 'Exportar boletas y planillas de ISSS y AFP');

-- Matriz: lista de permisos por rol (módulo.acción)
WITH matriz (rol, permiso) AS (
  SELECT 'administrador', unnest(ARRAY[
    'empresa.ver', 'empresa.configurar', 'sucursales.ver', 'sucursales.gestionar', 'usuarios.gestionar',
    'bitacora.ver', 'bitacora.exportar', 'respaldo.crear', 'respaldo.restaurar',
    'catalogo.ver', 'catalogo.editar', 'catalogo.inactivar', 'catalogo.importar',
    'partidas.ver', 'partidas.registrar', 'partidas.contabilizar', 'partidas.editar_contabilizada', 'partidas.anular',
    'ajustes.generar', 'periodos.cerrar', 'periodos.reabrir',
    'reportes.ver', 'reportes.exportar', 'estados.ver', 'estados.exportar', 'estados.firmar',
    'analitica.ver', 'analitica.exportar', 'iva.ver', 'iva.exportar', 'declaraciones.ver', 'declaraciones.exportar',
    'dte.ver', 'dte.emitir', 'dte.invalidar', 'terceros.ver', 'terceros.registrar', 'operaciones.ver', 'operaciones.registrar',
    'inventario.ver', 'inventario.registrar', 'inventario.contar', 'inventario.aprobar_ajuste',
    'tesoreria.ver', 'tesoreria.registrar', 'tesoreria.conciliar', 'activo_fijo.ver', 'activo_fijo.registrar',
    'planilla.ver', 'planilla.calcular', 'planilla.exportar'])
  UNION ALL
  SELECT 'contador', unnest(ARRAY[
    'empresa.ver', 'sucursales.ver', 'bitacora.ver', 'bitacora.exportar', 'respaldo.crear',
    'catalogo.ver', 'catalogo.editar', 'catalogo.inactivar', 'catalogo.importar',
    'partidas.ver', 'partidas.registrar', 'partidas.contabilizar', 'partidas.editar_contabilizada', 'partidas.anular',
    'ajustes.generar', 'periodos.cerrar',
    'reportes.ver', 'reportes.exportar', 'estados.ver', 'estados.exportar', 'estados.firmar',
    'analitica.ver', 'analitica.exportar', 'iva.ver', 'iva.exportar',
    'declaraciones.ver', 'declaraciones.generar', 'declaraciones.exportar',
    'dte.ver', 'dte.emitir', 'dte.invalidar', 'terceros.ver', 'terceros.registrar', 'operaciones.ver', 'operaciones.registrar',
    'inventario.ver', 'inventario.registrar', 'inventario.contar', 'inventario.aprobar_ajuste',
    'tesoreria.ver', 'tesoreria.registrar', 'tesoreria.conciliar', 'activo_fijo.ver', 'activo_fijo.registrar',
    'planilla.ver', 'planilla.calcular', 'planilla.exportar'])
  UNION ALL
  SELECT 'auxiliar', unnest(ARRAY[
    'empresa.ver', 'sucursales.ver', 'catalogo.ver', 'partidas.ver', 'partidas.registrar',
    'reportes.ver', 'reportes.exportar', 'estados.ver', 'analitica.ver', 'iva.ver',
    'dte.ver', 'dte.emitir', 'terceros.ver', 'terceros.registrar', 'operaciones.ver', 'operaciones.registrar',
    'inventario.ver', 'inventario.registrar', 'inventario.contar',
    'tesoreria.ver', 'tesoreria.registrar', 'activo_fijo.ver', 'activo_fijo.registrar'])
  UNION ALL
  SELECT 'consulta', unnest(ARRAY[
    'empresa.ver', 'sucursales.ver', 'bitacora.ver', 'catalogo.ver', 'partidas.ver',
    'reportes.ver', 'reportes.exportar', 'estados.ver', 'estados.exportar', 'analitica.ver',
    'iva.ver', 'iva.exportar', 'declaraciones.ver', 'dte.ver', 'terceros.ver', 'operaciones.ver',
    'inventario.ver', 'tesoreria.ver', 'activo_fijo.ver'])
)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM matriz m
JOIN roles r ON r.codigo = m.rol
JOIN permisos p ON p.modulo || '.' || p.accion = m.permiso;

-- Verificación: cada permiso de la matriz debe existir en la tabla de permisos
DO $$
BEGIN
  IF (SELECT count(*) FROM rol_permisos) <> 51 + 47 + 23 + 19 THEN
    RAISE EXCEPTION 'La matriz de permisos no coincide con la tabla de permisos (% asignaciones)', (SELECT count(*) FROM rol_permisos);
  END IF;
END $$;

-- Consulta usada por la API para saber si un usuario puede hacer algo en una empresa
CREATE VIEW permisos_usuario WITH (security_invoker = true) AS
SELECT m.usuario_id, m.empresa_id, m.todas_sucursales, r.codigo AS rol, p.modulo || '.' || p.accion AS permiso
FROM membresias m
JOIN roles r ON r.id = m.rol_id
JOIN rol_permisos rp ON rp.rol_id = m.rol_id
JOIN permisos p ON p.id = rp.permiso_id
WHERE m.activa;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON permisos_usuario FROM anon, authenticated;
  END IF;
END $$;
