-- Empleados y asignación a sucursal (HU-70, S3-T94).
-- Los identificadores son únicos por empresa y el empleado pertenece a una sucursal de esa misma empresa.

CREATE TABLE "empleados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "dui" VARCHAR(20) NOT NULL,
    "nit" VARCHAR(20) NOT NULL,
    "numero_isss" VARCHAR(20) NOT NULL,
    "nup" VARCHAR(20) NOT NULL,
    "puesto" VARCHAR(100) NOT NULL,
    "area" VARCHAR(100),
    "salario" DECIMAL(14,2) NOT NULL,
    "fecha_ingreso" DATE NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "empleados_salario_no_negativo" CHECK ("salario" >= 0),
    CONSTRAINT "empleados_identificacion_no_vacia" CHECK (
      btrim("dui") <> '' AND btrim("nit") <> '' AND btrim("numero_isss") <> '' AND btrim("nup") <> ''
    ),
    CONSTRAINT "empleados_puesto_no_vacio" CHECK (btrim("puesto") <> ''),
    CONSTRAINT "empleados_area_no_vacia" CHECK ("area" IS NULL OR btrim("area") <> '')
);

CREATE UNIQUE INDEX "empleados_empresa_id_dui_key" ON "empleados"("empresa_id", "dui");
CREATE UNIQUE INDEX "empleados_empresa_id_nit_key" ON "empleados"("empresa_id", "nit");
CREATE UNIQUE INDEX "empleados_empresa_id_numero_isss_key" ON "empleados"("empresa_id", "numero_isss");
CREATE UNIQUE INDEX "empleados_empresa_id_nup_key" ON "empleados"("empresa_id", "nup");
CREATE INDEX "empleados_empresa_id_sucursal_id_idx" ON "empleados"("empresa_id", "sucursal_id");

ALTER TABLE "empleados" ADD CONSTRAINT "empleados_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "empleados" IS 'Personas empleadas por una empresa, asignadas a una sucursal para el cálculo de planillas.';
COMMENT ON COLUMN "empleados"."id" IS 'Identificador del empleado.';
COMMENT ON COLUMN "empleados"."empresa_id" IS 'Empresa a la que pertenece el empleado.';
COMMENT ON COLUMN "empleados"."sucursal_id" IS 'Sucursal de la misma empresa a la que está asignado.';
COMMENT ON COLUMN "empleados"."dui" IS 'Documento Único de Identidad del empleado, único por empresa.';
COMMENT ON COLUMN "empleados"."nit" IS 'Número de Identificación Tributaria del empleado, único por empresa.';
COMMENT ON COLUMN "empleados"."numero_isss" IS 'Número de afiliación al ISSS, único por empresa.';
COMMENT ON COLUMN "empleados"."nup" IS 'Número Único Previsional de AFP, único por empresa.';
COMMENT ON COLUMN "empleados"."puesto" IS 'Puesto o cargo del empleado.';
COMMENT ON COLUMN "empleados"."area" IS 'Área de trabajo del empleado, si aplica.';
COMMENT ON COLUMN "empleados"."salario" IS 'Salario mensual en dólares, no negativo.';
COMMENT ON COLUMN "empleados"."fecha_ingreso" IS 'Fecha de ingreso del empleado.';
COMMENT ON COLUMN "empleados"."activo" IS 'Indica si el empleado puede incluirse en nuevas planillas.';
COMMENT ON COLUMN "empleados"."creado_en" IS 'Fecha y hora de creación.';
COMMENT ON COLUMN "empleados"."actualizado_en" IS 'Fecha y hora de la última modificación.';

CREATE FUNCTION interno.empleados_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "empleados_validar_antes" BEFORE INSERT OR UPDATE ON "empleados"
  FOR EACH ROW EXECUTE FUNCTION interno.empleados_validar();
CREATE TRIGGER "empleados_actualizado_en" BEFORE UPDATE ON "empleados"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "empleados_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "empleados"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.empleados_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.empleados_validar() IS 'Trigger de empleados: valida que la sucursal corresponda a la empresa.';

ALTER TABLE "empleados" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "empleados" FROM anon, authenticated;
  END IF;
END $$;
