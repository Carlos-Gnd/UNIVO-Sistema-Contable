-- Descripciones de tablas y columnas (diccionario de datos).
-- El diccionario se genera desde estos comentarios con packages/db/scripts/generar-diccionario.mjs.

-- ───────────── Columnas comunes ─────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
             AND column_name IN ('id', 'empresa_id', 'creado_en', 'actualizado_en', 'activa', 'activo') LOOP
    EXECUTE format('COMMENT ON COLUMN public.%I.%I IS %L', c.table_name, c.column_name,
      CASE c.column_name
        WHEN 'id' THEN 'Identificador único del registro.'
        WHEN 'empresa_id' THEN 'Empresa a la que pertenece el registro.'
        WHEN 'creado_en' THEN 'Fecha y hora de creación.'
        WHEN 'actualizado_en' THEN 'Fecha y hora de la última modificación (la fija un trigger).'
        ELSE 'Indica si el registro está activo; los inactivos se conservan pero no se usan en registros nuevos.'
      END);
  END LOOP;
END $$;

-- ───────────── Organización ─────────────
COMMENT ON TABLE empresas IS 'Contribuyentes que llevan su contabilidad en el sistema (persona natural o sociedad).';
COMMENT ON COLUMN empresas.nombre IS 'Nombre o razón social del contribuyente.';
COMMENT ON COLUMN empresas.nombre_comercial IS 'Nombre comercial, si es distinto de la razón social.';
COMMENT ON COLUMN empresas.nit IS 'Número de Identificación Tributaria; único en el sistema.';
COMMENT ON COLUMN empresas.nrc IS 'Número de Registro de Contribuyente del IVA.';
COMMENT ON COLUMN empresas.tipo_contribuyente IS 'Persona natural o sociedad; determina el cálculo del ISR, la reserva legal y el patrimonio.';
COMMENT ON COLUMN empresas.clasificacion IS 'Grande, mediano u otro contribuyente; determina retenciones y percepciones del 1 % de IVA.';
COMMENT ON COLUMN empresas.actividad_economica IS 'Actividad económica registrada en Hacienda.';
COMMENT ON COLUMN empresas.direccion IS 'Dirección del domicilio fiscal.';
COMMENT ON COLUMN empresas.telefono IS 'Teléfono de contacto.';
COMMENT ON COLUMN empresas.correo IS 'Correo electrónico de contacto.';
COMMENT ON COLUMN empresas.logo_url IS 'Ruta del logotipo en Supabase Storage; se muestra en la interfaz y en los reportes.';
COMMENT ON COLUMN empresas.modo_numeracion IS 'Ámbito del correlativo de partidas: anual, mensual o por tipo de partida.';

COMMENT ON TABLE sucursales IS 'Establecimientos de la empresa; cada partida y documento indica su sucursal.';
COMMENT ON COLUMN sucursales.nombre IS 'Nombre de la sucursal.';
COMMENT ON COLUMN sucursales.codigo_establecimiento IS 'Código de establecimiento asignado por Hacienda; forma parte del número de control del DTE.';
COMMENT ON COLUMN sucursales.codigo_punto_venta IS 'Código del punto de venta; forma parte del número de control del DTE.';
COMMENT ON COLUMN sucursales.direccion IS 'Dirección de la sucursal.';
COMMENT ON COLUMN sucursales.es_matriz IS 'Indica si es la casa matriz de la empresa.';

COMMENT ON TABLE usuarios IS 'Perfil de las personas usuarias; el id coincide con el de Supabase Auth.';
COMMENT ON COLUMN usuarios.nombre IS 'Nombre completo.';
COMMENT ON COLUMN usuarios.correo IS 'Correo con el que inicia sesión; único.';
COMMENT ON COLUMN usuarios.idioma IS 'Idioma de la interfaz: es o en.';

COMMENT ON TABLE roles IS 'Roles del sistema: administrador, contador, auxiliar contable y solo consulta.';
COMMENT ON COLUMN roles.codigo IS 'Código interno del rol, usado por la API.';
COMMENT ON COLUMN roles.nombre IS 'Nombre del rol que ve el usuario.';

COMMENT ON TABLE permisos IS 'Acciones autorizables del sistema, expresadas como módulo y acción.';
COMMENT ON COLUMN permisos.modulo IS 'Módulo al que pertenece la acción (por ejemplo, partidas).';
COMMENT ON COLUMN permisos.accion IS 'Acción autorizada dentro del módulo (por ejemplo, contabilizar).';
COMMENT ON COLUMN permisos.descripcion IS 'Explicación de lo que permite.';

COMMENT ON TABLE rol_permisos IS 'Matriz de permisos: acciones que tiene cada rol.';
COMMENT ON COLUMN rol_permisos.rol_id IS 'Rol que recibe el permiso.';
COMMENT ON COLUMN rol_permisos.permiso_id IS 'Permiso otorgado.';

COMMENT ON TABLE membresias IS 'Acceso de un usuario a una empresa con un rol; un usuario puede tener roles distintos en empresas distintas.';
COMMENT ON COLUMN membresias.usuario_id IS 'Usuario que tiene el acceso.';
COMMENT ON COLUMN membresias.rol_id IS 'Rol del usuario en esta empresa.';
COMMENT ON COLUMN membresias.todas_sucursales IS 'Si es verdadero, ve todas las sucursales; si no, solo las de membresia_sucursales.';

COMMENT ON TABLE membresia_sucursales IS 'Sucursales a las que está limitado un usuario dentro de una empresa.';
COMMENT ON COLUMN membresia_sucursales.membresia_id IS 'Membresía limitada.';
COMMENT ON COLUMN membresia_sucursales.sucursal_id IS 'Sucursal permitida.';

-- ───────────── Catálogo, ejercicios y períodos ─────────────
COMMENT ON TABLE cuentas IS 'Catálogo de cuentas de cada empresa; el nivel y la cuenta padre se calculan del código.';
COMMENT ON COLUMN cuentas.codigo IS 'Código numérico de 1, 2, 4, 6, 8 o 10 dígitos (clase, rubro, mayor, subcuenta, detalle, analítica).';
COMMENT ON COLUMN cuentas.nombre IS 'Nombre de la cuenta.';
COMMENT ON COLUMN cuentas.nivel IS 'Nivel jerárquico de 1 a 6, calculado a partir de la longitud del código.';
COMMENT ON COLUMN cuentas.naturaleza IS 'Deudora o acreedora; se usa para detectar saldos contrarios.';
COMMENT ON COLUMN cuentas.tipo IS 'Clase de la cuenta: activo, pasivo, patrimonio, costos y gastos, ingresos, liquidadora u orden.';
COMMENT ON COLUMN cuentas.cuenta_padre_id IS 'Cuenta del nivel superior, calculada a partir del código.';

COMMENT ON TABLE ejercicios IS 'Años contables de cada empresa; al crear uno se generan sus doce períodos.';
COMMENT ON COLUMN ejercicios.anio IS 'Año del ejercicio.';
COMMENT ON COLUMN ejercicios.fecha_inicio IS 'Primer día del ejercicio.';
COMMENT ON COLUMN ejercicios.fecha_fin IS 'Último día del ejercicio.';
COMMENT ON COLUMN ejercicios.estado IS 'Abierto o cerrado.';

COMMENT ON TABLE periodos IS 'Meses de cada ejercicio; un período cerrado bloquea sus partidas.';
COMMENT ON COLUMN periodos.ejercicio_id IS 'Ejercicio al que pertenece el mes.';
COMMENT ON COLUMN periodos.mes IS 'Número del mes, de 1 a 12.';
COMMENT ON COLUMN periodos.fecha_inicio IS 'Primer día del mes.';
COMMENT ON COLUMN periodos.fecha_fin IS 'Último día del mes.';
COMMENT ON COLUMN periodos.estado IS 'Abierto o cerrado; no se cierra si tiene borradores.';
COMMENT ON COLUMN periodos.cerrado_en IS 'Fecha y hora del cierre; vacío si está abierto.';

-- ───────────── Partidas ─────────────
COMMENT ON TABLE partidas IS 'Encabezado de las partidas del libro diario.';
COMMENT ON COLUMN partidas.sucursal_id IS 'Sucursal que origina la partida.';
COMMENT ON COLUMN partidas.periodo_id IS 'Período al que pertenece, asignado por un trigger según la fecha.';
COMMENT ON COLUMN partidas.fecha IS 'Fecha contable de la partida.';
COMMENT ON COLUMN partidas.tipo IS 'Apertura, operación, ajuste, cierre, reapertura o reversión.';
COMMENT ON COLUMN partidas.estado IS 'Borrador (no afecta libros), contabilizada o anulada (compensada por su reversión).';
COMMENT ON COLUMN partidas.numero IS 'Correlativo asignado al contabilizar, sin saltos dentro de su ámbito.';
COMMENT ON COLUMN partidas.ambito_numeracion IS 'Ámbito del correlativo: año, año-mes o año-tipo según la empresa.';
COMMENT ON COLUMN partidas.concepto IS 'Descripción de la operación.';
COMMENT ON COLUMN partidas.documento_tipo IS 'Tipo de documento de soporte (CCF, factura, cheque, recibo…).';
COMMENT ON COLUMN partidas.documento_numero IS 'Número del documento de soporte.';
COMMENT ON COLUMN partidas.origen IS 'Módulo que generó la partida: manual, compras, ventas, planilla, bancos, depreciación, cierre…';
COMMENT ON COLUMN partidas.origen_id IS 'Registro del módulo de origen que generó la partida.';
COMMENT ON COLUMN partidas.partida_revertida_id IS 'Partida original que esta partida revierte (solo en reversiones).';
COMMENT ON COLUMN partidas.version IS 'Versión de la partida; aumenta con cada edición después de contabilizada.';
COMMENT ON COLUMN partidas.creado_por IS 'Usuario que registró la partida.';
COMMENT ON COLUMN partidas.contabilizado_por IS 'Usuario que contabilizó la partida.';
COMMENT ON COLUMN partidas.contabilizado_en IS 'Fecha y hora de la contabilización.';
COMMENT ON COLUMN partidas.anulado_por IS 'Usuario que anuló la partida.';
COMMENT ON COLUMN partidas.anulado_en IS 'Fecha y hora de la anulación.';
COMMENT ON COLUMN partidas.motivo_anulacion IS 'Motivo de la anulación; obligatorio para anular.';

COMMENT ON TABLE partida_detalles IS 'Líneas de cada partida: cuenta y monto en el debe o en el haber.';
COMMENT ON COLUMN partida_detalles.partida_id IS 'Partida a la que pertenece la línea.';
COMMENT ON COLUMN partida_detalles.cuenta_id IS 'Cuenta de último nivel afectada.';
COMMENT ON COLUMN partida_detalles.concepto IS 'Descripción opcional de la línea.';
COMMENT ON COLUMN partida_detalles.debe IS 'Monto en el debe; si es mayor que cero, el haber debe ser cero.';
COMMENT ON COLUMN partida_detalles.haber IS 'Monto en el haber; si es mayor que cero, el debe debe ser cero.';
COMMENT ON COLUMN partida_detalles.orden IS 'Posición de la línea dentro de la partida.';

COMMENT ON TABLE correlativos IS 'Último número de partida usado por empresa y ámbito de numeración.';
COMMENT ON COLUMN correlativos.ambito IS 'Ámbito de numeración (por ejemplo 2026, 2026-11 o 2026-ajuste).';
COMMENT ON COLUMN correlativos.ultimo IS 'Último número asignado en el ámbito.';

-- ───────────── Auditoría ─────────────
COMMENT ON TABLE bitacora IS 'Registro inmutable de todos los cambios, con valores anteriores y nuevos.';
COMMENT ON COLUMN bitacora.usuario_id IS 'Usuario que hizo el cambio (tomado de la sesión de la API).';
COMMENT ON COLUMN bitacora.tabla IS 'Tabla modificada.';
COMMENT ON COLUMN bitacora.registro_id IS 'Identificador del registro modificado.';
COMMENT ON COLUMN bitacora.accion IS 'Tipo de cambio: INSERT, UPDATE o DELETE.';
COMMENT ON COLUMN bitacora.datos_anteriores IS 'Valores del registro antes del cambio.';
COMMENT ON COLUMN bitacora.datos_nuevos IS 'Valores del registro después del cambio.';
