-- Detalle mensual por empleado para las planillas de ISSS y AFP (HU-75, S3-T109).
-- Conserva una fotografía de las cifras del cálculo y evita reconstruir meses anteriores con datos actuales.

CREATE TABLE "planillas_calculadas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "periodo" DATE NOT NULL,
    "partida_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL,
    "dui" VARCHAR(20) NOT NULL,
    "numero_isss" VARCHAR(20) NOT NULL,
    "nup" VARCHAR(20) NOT NULL,
    "salario_cotizable" DECIMAL(14,2) NOT NULL,
    "isss_laboral" DECIMAL(14,2) NOT NULL,
    "isss_patronal" DECIMAL(14,2) NOT NULL,
    "afp_laboral" DECIMAL(14,2) NOT NULL,
    "afp_patronal" DECIMAL(14,2) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planillas_calculadas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "planillas_calculadas_periodo_inicio_mes" CHECK ("periodo" = date_trunc('month', "periodo")::date),
    CONSTRAINT "planillas_calculadas_importes_no_negativos" CHECK (
      "salario_cotizable" >= 0 AND "isss_laboral" >= 0 AND "isss_patronal" >= 0
      AND "afp_laboral" >= 0 AND "afp_patronal" >= 0
    ),
    CONSTRAINT "planillas_calculadas_identificacion_no_vacia" CHECK (
      btrim("nombres") <> '' AND btrim("apellidos") <> '' AND btrim("dui") <> ''
      AND btrim("numero_isss") <> '' AND btrim("nup") <> ''
    ),
    CONSTRAINT "planillas_calculadas_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planillas_calculadas_sucursal_id_fkey"
      FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planillas_calculadas_partida_id_fkey"
      FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planillas_calculadas_empleado_id_empresa_id_fkey"
      FOREIGN KEY ("empleado_id", "empresa_id") REFERENCES "empleados"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "planillas_calculadas_empresa_periodo_empleado_unq"
      UNIQUE ("empresa_id", "periodo", "empleado_id")
);

CREATE INDEX "planillas_calculadas_empresa_id_periodo_idx" ON "planillas_calculadas"("empresa_id", "periodo");
CREATE INDEX "planillas_calculadas_sucursal_id_periodo_idx" ON "planillas_calculadas"("sucursal_id", "periodo");

COMMENT ON TABLE "planillas_calculadas" IS 'Fotografía por empleado del cálculo mensual usada para generar las planillas de ISSS y AFP.';
COMMENT ON COLUMN "planillas_calculadas"."id" IS 'Identificador del detalle calculado.';
COMMENT ON COLUMN "planillas_calculadas"."empresa_id" IS 'Empresa a la que pertenece el cálculo.';
COMMENT ON COLUMN "planillas_calculadas"."sucursal_id" IS 'Sucursal para la que se calculó la planilla.';
COMMENT ON COLUMN "planillas_calculadas"."periodo" IS 'Primer día del mes al que corresponden las cifras.';
COMMENT ON COLUMN "planillas_calculadas"."partida_id" IS 'Partida en borrador creada por el cálculo de planilla.';
COMMENT ON COLUMN "planillas_calculadas"."empleado_id" IS 'Empleado al que corresponden las cifras.';
COMMENT ON COLUMN "planillas_calculadas"."nombres" IS 'Nombres del empleado guardados al calcular la planilla.';
COMMENT ON COLUMN "planillas_calculadas"."apellidos" IS 'Apellidos del empleado guardados al calcular la planilla.';
COMMENT ON COLUMN "planillas_calculadas"."dui" IS 'DUI guardado al calcular la planilla.';
COMMENT ON COLUMN "planillas_calculadas"."numero_isss" IS 'Número ISSS guardado al calcular la planilla.';
COMMENT ON COLUMN "planillas_calculadas"."nup" IS 'NUP de AFP guardado al calcular la planilla.';
COMMENT ON COLUMN "planillas_calculadas"."salario_cotizable" IS 'Salario bruto ajustado que sirvió de base para las cotizaciones.';
COMMENT ON COLUMN "planillas_calculadas"."isss_laboral" IS 'Cotización laboral ISSS calculada para el empleado.';
COMMENT ON COLUMN "planillas_calculadas"."isss_patronal" IS 'Cotización patronal ISSS calculada para el empleado.';
COMMENT ON COLUMN "planillas_calculadas"."afp_laboral" IS 'Cotización laboral AFP calculada para el empleado.';
COMMENT ON COLUMN "planillas_calculadas"."afp_patronal" IS 'Cotización patronal AFP calculada para el empleado.';
COMMENT ON COLUMN "planillas_calculadas"."creado_en" IS 'Fecha y hora de creación del detalle.';
COMMENT ON COLUMN "planillas_calculadas"."actualizado_en" IS 'Fecha y hora de la última actualización del cálculo.';

CREATE FUNCTION interno.planillas_calculadas_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_empresa_id UUID;
  v_periodo DATE;
BEGIN
  v_empresa_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END;
  v_periodo := CASE WHEN TG_OP = 'DELETE' THEN OLD.periodo ELSE NEW.periodo END;

  IF EXISTS (
    SELECT 1 FROM planillas_presentaciones p
    WHERE p.empresa_id = v_empresa_id AND p.periodo = v_periodo
  ) THEN
    RAISE EXCEPTION 'No se puede modificar el cálculo de una planilla ya presentada'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM sucursales s
    WHERE s.id = NEW.sucursal_id AND s.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM partidas p
    WHERE p.id = NEW.partida_id AND p.empresa_id = NEW.empresa_id
      AND p.sucursal_id = NEW.sucursal_id AND p.origen = 'planilla'
      AND p.fecha = (date_trunc('month', NEW.periodo) + interval '1 month - 1 day')::date
  ) THEN
    RAISE EXCEPTION 'La partida no corresponde al cálculo de planilla indicado'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER "planillas_calculadas_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "planillas_calculadas"
  FOR EACH ROW EXECUTE FUNCTION interno.planillas_calculadas_validar();
CREATE TRIGGER "planillas_calculadas_actualizado_en" BEFORE UPDATE ON "planillas_calculadas"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "planillas_calculadas_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "planillas_calculadas"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.planillas_calculadas_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.planillas_calculadas_validar() IS 'Valida empresa, sucursal y partida del detalle y bloquea cambios después de la presentación.';

ALTER TABLE "planillas_calculadas" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "planillas_calculadas" FROM anon, authenticated;
  END IF;
END $$;
