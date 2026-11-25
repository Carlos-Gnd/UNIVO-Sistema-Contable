-- Registro de presentación por institución y período (HU-75, S3-T109).

CREATE TYPE "tipo_planilla_oficial" AS ENUM ('isss', 'afp');

CREATE TABLE "planillas_presentaciones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "periodo" DATE NOT NULL,
    "tipo" "tipo_planilla_oficial" NOT NULL,
    "presentada_por" UUID NOT NULL,
    "presentada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planillas_presentaciones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "planillas_presentaciones_periodo_inicio_mes" CHECK ("periodo" = date_trunc('month', "periodo")::date),
    CONSTRAINT "planillas_presentaciones_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planillas_presentaciones_presentada_por_fkey"
      FOREIGN KEY ("presentada_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planillas_presentaciones_empresa_periodo_tipo_unq"
      UNIQUE ("empresa_id", "periodo", "tipo")
);

CREATE INDEX "planillas_presentaciones_empresa_id_periodo_idx" ON "planillas_presentaciones"("empresa_id", "periodo");

COMMENT ON TYPE "tipo_planilla_oficial" IS 'Institución de la planilla de cotizaciones.';
COMMENT ON TABLE "planillas_presentaciones" IS 'Registro inmutable de quién presentó la planilla ISSS o AFP y cuándo.';
COMMENT ON COLUMN "planillas_presentaciones"."id" IS 'Identificador del registro de presentación.';
COMMENT ON COLUMN "planillas_presentaciones"."empresa_id" IS 'Empresa que presentó la planilla.';
COMMENT ON COLUMN "planillas_presentaciones"."periodo" IS 'Primer día del mes presentado.';
COMMENT ON COLUMN "planillas_presentaciones"."tipo" IS 'Institución a la que se presentó la planilla.';
COMMENT ON COLUMN "planillas_presentaciones"."presentada_por" IS 'Usuario que registró la presentación.';
COMMENT ON COLUMN "planillas_presentaciones"."presentada_en" IS 'Fecha y hora de registro de la presentación.';

CREATE FUNCTION interno.planillas_presentaciones_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'El registro de una presentación no se puede modificar ni eliminar'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM planillas_calculadas p
    WHERE p.empresa_id = NEW.empresa_id AND p.periodo = NEW.periodo
  ) THEN
    RAISE EXCEPTION 'No hay cálculos de planilla para el período indicado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "planillas_presentaciones_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "planillas_presentaciones"
  FOR EACH ROW EXECUTE FUNCTION interno.planillas_presentaciones_validar();
CREATE TRIGGER "planillas_presentaciones_bitacora" AFTER INSERT ON "planillas_presentaciones"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.planillas_presentaciones_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.planillas_presentaciones_validar() IS 'Valida que exista un cálculo y protege el registro inmutable de presentación.';

ALTER TABLE "planillas_presentaciones" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "planillas_presentaciones" FROM anon, authenticated;
  END IF;
END $$;
