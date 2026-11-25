-- Nombres para las planillas de ISSS y AFP (HU-75, S3-T109).
-- Los registros previos reciben un nombre provisional explícito para conservar la obligatoriedad.

ALTER TABLE "empleados"
  ADD COLUMN "nombres" VARCHAR(100) NOT NULL DEFAULT 'Nombre pendiente',
  ADD COLUMN "apellidos" VARCHAR(100) NOT NULL DEFAULT 'Apellido pendiente';

ALTER TABLE "empleados"
  ALTER COLUMN "nombres" DROP DEFAULT,
  ALTER COLUMN "apellidos" DROP DEFAULT,
  ADD CONSTRAINT "empleados_nombre_completo_no_vacio" CHECK (
    btrim("nombres") <> '' AND btrim("apellidos") <> ''
  );

CREATE UNIQUE INDEX "empleados_id_empresa_id_key" ON "empleados"("id", "empresa_id");

COMMENT ON COLUMN "empleados"."nombres" IS 'Nombres de la persona empleada; los registros previos se identifican como pendientes de completar.';
COMMENT ON COLUMN "empleados"."apellidos" IS 'Apellidos de la persona empleada; los registros previos se identifican como pendientes de completar.';
