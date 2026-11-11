-- Correcciones del asesor de Supabase (supabase db advisors).

-- Índices para llaves foráneas (lint 0001_unindexed_foreign_keys)
CREATE INDEX "membresia_sucursales_sucursal_id_idx" ON "membresia_sucursales"("sucursal_id");
CREATE INDEX "membresias_rol_id_idx" ON "membresias"("rol_id");
CREATE INDEX "partidas_sucursal_id_idx" ON "partidas"("sucursal_id");
CREATE INDEX "partidas_partida_revertida_id_idx" ON "partidas"("partida_revertida_id");
CREATE INDEX "rol_permisos_permiso_id_idx" ON "rol_permisos"("permiso_id");

-- search_path fijo en las funciones (lint 0011_function_search_path_mutable):
-- evita que un objeto con el mismo nombre en otro esquema suplante a las tablas reales.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS firma FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'interno' LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.firma);
  END LOOP;
END $$;

-- Nota: el lint 0008_rls_enabled_no_policy (INFO) es intencional. Las tablas no tienen políticas para que la
-- API de datos de Supabase (anon/authenticated) no vea nada; la aplicación accede solo a través de la API NestJS.
