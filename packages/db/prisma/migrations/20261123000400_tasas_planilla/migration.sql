-- Tasas de ISSS, AFP y tabla de retención de renta por fecha de vigencia (HU-71, S3-T97).
-- Cada cambio se registra como una versión nueva para conservar las reglas usadas en períodos anteriores.

CREATE TABLE "configuraciones_planilla" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "tasa_isss_laboral" DECIMAL(5,2) NOT NULL,
    "tasa_isss_patronal" DECIMAL(5,2) NOT NULL,
    "techo_isss" DECIMAL(14,2) NOT NULL,
    "tasa_afp_laboral" DECIMAL(5,2) NOT NULL,
    "tasa_afp_patronal" DECIMAL(5,2) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuraciones_planilla_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuraciones_planilla_tasa_isss_laboral_rango" CHECK ("tasa_isss_laboral" BETWEEN 0 AND 100),
    CONSTRAINT "configuraciones_planilla_tasa_isss_patronal_rango" CHECK ("tasa_isss_patronal" BETWEEN 0 AND 100),
    CONSTRAINT "configuraciones_planilla_techo_isss_no_negativo" CHECK ("techo_isss" >= 0),
    CONSTRAINT "configuraciones_planilla_tasa_afp_laboral_rango" CHECK ("tasa_afp_laboral" BETWEEN 0 AND 100),
    CONSTRAINT "configuraciones_planilla_tasa_afp_patronal_rango" CHECK ("tasa_afp_patronal" BETWEEN 0 AND 100)
);

CREATE TABLE "tramos_retencion_planilla" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "configuracion_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "desde" DECIMAL(14,2) NOT NULL,
    "hasta" DECIMAL(14,2),
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "cuota_fija" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "tramos_retencion_planilla_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tramos_retencion_planilla_orden_rango" CHECK ("orden" BETWEEN 1 AND 20),
    CONSTRAINT "tramos_retencion_planilla_desde_no_negativo" CHECK ("desde" >= 0),
    CONSTRAINT "tramos_retencion_planilla_limite_superior_mayor" CHECK ("hasta" IS NULL OR "hasta" > "desde"),
    CONSTRAINT "tramos_retencion_planilla_porcentaje_rango" CHECK ("porcentaje" BETWEEN 0 AND 100),
    CONSTRAINT "tramos_retencion_planilla_cuota_no_negativa" CHECK ("cuota_fija" >= 0)
);

CREATE UNIQUE INDEX "configuraciones_planilla_id_empresa_id_key"
  ON "configuraciones_planilla"("id", "empresa_id");
CREATE UNIQUE INDEX "configuraciones_planilla_empresa_id_vigente_desde_key"
  ON "configuraciones_planilla"("empresa_id", "vigente_desde");
CREATE INDEX "configuraciones_planilla_empresa_id_vigente_desde_idx"
  ON "configuraciones_planilla"("empresa_id", "vigente_desde");
CREATE UNIQUE INDEX "tramos_retencion_planilla_configuracion_id_orden_key"
  ON "tramos_retencion_planilla"("configuracion_id", "orden");
CREATE INDEX "tramos_retencion_planilla_empresa_id_configuracion_id_idx"
  ON "tramos_retencion_planilla"("empresa_id", "configuracion_id");

ALTER TABLE "configuraciones_planilla" ADD CONSTRAINT "configuraciones_planilla_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tramos_retencion_planilla" ADD CONSTRAINT "tramos_retencion_planilla_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tramos_retencion_planilla" ADD CONSTRAINT "tramos_retencion_planilla_configuracion_empresa_fkey"
  FOREIGN KEY ("configuracion_id", "empresa_id") REFERENCES "configuraciones_planilla"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "configuraciones_planilla" IS 'Tasas de ISSS, AFP y fecha de vigencia para el cálculo de planillas de una empresa.';
COMMENT ON COLUMN "configuraciones_planilla"."id" IS 'Identificador de la versión de tasas.';
COMMENT ON COLUMN "configuraciones_planilla"."empresa_id" IS 'Empresa a la que aplican las tasas.';
COMMENT ON COLUMN "configuraciones_planilla"."vigente_desde" IS 'Primer día en que esta versión de tasas puede usarse.';
COMMENT ON COLUMN "configuraciones_planilla"."tasa_isss_laboral" IS 'Porcentaje de cotización laboral al ISSS.';
COMMENT ON COLUMN "configuraciones_planilla"."tasa_isss_patronal" IS 'Porcentaje de cotización patronal al ISSS.';
COMMENT ON COLUMN "configuraciones_planilla"."techo_isss" IS 'Salario máximo sujeto a cotización al ISSS.';
COMMENT ON COLUMN "configuraciones_planilla"."tasa_afp_laboral" IS 'Porcentaje de cotización laboral a AFP.';
COMMENT ON COLUMN "configuraciones_planilla"."tasa_afp_patronal" IS 'Porcentaje de cotización patronal a AFP.';
COMMENT ON COLUMN "configuraciones_planilla"."creado_en" IS 'Fecha y hora en que se creó la versión.';

COMMENT ON TABLE "tramos_retencion_planilla" IS 'Tramos marginales de retención mensual de renta de una versión de tasas.';
COMMENT ON COLUMN "tramos_retencion_planilla"."id" IS 'Identificador del tramo.';
COMMENT ON COLUMN "tramos_retencion_planilla"."empresa_id" IS 'Empresa a la que pertenece la tabla de retención.';
COMMENT ON COLUMN "tramos_retencion_planilla"."configuracion_id" IS 'Versión de tasas a la que pertenece este tramo.';
COMMENT ON COLUMN "tramos_retencion_planilla"."orden" IS 'Posición del tramo en la secuencia progresiva.';
COMMENT ON COLUMN "tramos_retencion_planilla"."desde" IS 'Límite inferior, excluido para los tramos posteriores al primero.';
COMMENT ON COLUMN "tramos_retencion_planilla"."hasta" IS 'Límite superior inclusivo; nulo identifica el último tramo.';
COMMENT ON COLUMN "tramos_retencion_planilla"."porcentaje" IS 'Porcentaje marginal aplicado al exceso sobre el límite inferior.';
COMMENT ON COLUMN "tramos_retencion_planilla"."cuota_fija" IS 'Cuota fija que se suma al porcentaje marginal.';

CREATE FUNCTION interno.planilla_bloquear_cambios() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'La configuración de planilla es inmutable; registra una versión con nueva vigencia'
    USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION interno.planilla_bloquear_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'No se permite vaciar el historial de tasas de planilla'
    USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION interno.planilla_validar_tramos() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_configuracion uuid;
  v_total integer;
  v_orden integer := 0;
  v_limite_anterior numeric(14,2);
  v_tramo record;
BEGIN
  IF TG_TABLE_NAME = 'configuraciones_planilla' THEN
    v_configuracion := NEW.id;
  ELSE
    v_configuracion := NEW.configuracion_id;
  END IF;

  SELECT count(*) INTO v_total
    FROM public.tramos_retencion_planilla WHERE configuracion_id = v_configuracion;
  IF v_total < 1 OR v_total > 20 THEN
    RAISE EXCEPTION 'La tabla de retención debe tener entre uno y veinte tramos'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_tramo IN
    SELECT orden, desde, hasta FROM public.tramos_retencion_planilla
    WHERE configuracion_id = v_configuracion ORDER BY orden
  LOOP
    v_orden := v_orden + 1;
    IF v_tramo.orden <> v_orden THEN
      RAISE EXCEPTION 'Los tramos de retención deben tener orden consecutivo desde uno'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden = 1 AND v_tramo.desde <> 0 THEN
      RAISE EXCEPTION 'El primer tramo de retención debe comenzar en cero'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden > 1 AND (v_limite_anterior IS NULL OR v_tramo.desde <> v_limite_anterior) THEN
      RAISE EXCEPTION 'Los tramos de retención deben ser continuos y sin traslapes'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden < v_total AND v_tramo.hasta IS NULL THEN
      RAISE EXCEPTION 'Solo el último tramo de retención puede quedar abierto'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden = v_total AND v_tramo.hasta IS NOT NULL THEN
      RAISE EXCEPTION 'El último tramo de retención debe quedar abierto'
        USING ERRCODE = 'check_violation';
    END IF;
    v_limite_anterior := v_tramo.hasta;
  END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION interno.planilla_inicializar_empresa() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_configuracion uuid;
BEGIN
  INSERT INTO public.configuraciones_planilla (
    empresa_id, vigente_desde, tasa_isss_laboral, tasa_isss_patronal, techo_isss, tasa_afp_laboral, tasa_afp_patronal
  ) VALUES (NEW.id, DATE '2026-01-01', 3.00, 7.50, 1000.00, 7.25, 8.75)
  RETURNING id INTO v_configuracion;

  INSERT INTO public.tramos_retencion_planilla
    (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
  VALUES
    (NEW.id, v_configuracion, 1, 0.00, 550.00, 0.00, 0.00),
    (NEW.id, v_configuracion, 2, 550.00, 895.24, 10.00, 17.67),
    (NEW.id, v_configuracion, 3, 895.24, 2038.10, 20.00, 60.00),
    (NEW.id, v_configuracion, 4, 2038.10, NULL, 30.00, 288.57);
  RETURN NEW;
END $$;

CREATE TRIGGER "configuraciones_planilla_inmutables"
  BEFORE UPDATE OR DELETE ON "configuraciones_planilla"
  FOR EACH ROW EXECUTE FUNCTION interno.planilla_bloquear_cambios();
CREATE TRIGGER "tramos_retencion_planilla_inmutables"
  BEFORE UPDATE OR DELETE ON "tramos_retencion_planilla"
  FOR EACH ROW EXECUTE FUNCTION interno.planilla_bloquear_cambios();
CREATE TRIGGER "configuraciones_planilla_no_truncate"
  BEFORE TRUNCATE ON "configuraciones_planilla"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.planilla_bloquear_truncate();
CREATE TRIGGER "tramos_retencion_planilla_no_truncate"
  BEFORE TRUNCATE ON "tramos_retencion_planilla"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.planilla_bloquear_truncate();

CREATE CONSTRAINT TRIGGER "configuraciones_planilla_tramos_completos"
  AFTER INSERT ON "configuraciones_planilla" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interno.planilla_validar_tramos();
CREATE CONSTRAINT TRIGGER "tramos_retencion_planilla_contiguos"
  AFTER INSERT ON "tramos_retencion_planilla" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interno.planilla_validar_tramos();

CREATE TRIGGER "configuraciones_planilla_bitacora"
  AFTER INSERT ON "configuraciones_planilla"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "tramos_retencion_planilla_bitacora"
  AFTER INSERT ON "tramos_retencion_planilla"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "empresas_planilla_inicializar"
  AFTER INSERT ON "empresas"
  FOR EACH ROW EXECUTE FUNCTION interno.planilla_inicializar_empresa();

REVOKE ALL ON FUNCTION interno.planilla_bloquear_cambios() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.planilla_bloquear_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.planilla_validar_tramos() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.planilla_inicializar_empresa() FROM PUBLIC;
COMMENT ON FUNCTION interno.planilla_bloquear_cambios() IS 'Trigger de tasas: conserva las versiones y sus tramos sin cambios.';
COMMENT ON FUNCTION interno.planilla_bloquear_truncate() IS 'Trigger de tasas: impide borrar el historial completo.';
COMMENT ON FUNCTION interno.planilla_validar_tramos() IS 'Trigger de tasas: exige tramos completos, consecutivos y continuos.';
COMMENT ON FUNCTION interno.planilla_inicializar_empresa() IS 'Trigger de empresas: carga la configuración inicial de planilla y retención.';

ALTER TABLE "configuraciones_planilla" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tramos_retencion_planilla" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "configuraciones_planilla", "tramos_retencion_planilla" FROM anon, authenticated;
  END IF;
END $$;

WITH nuevas AS (
  INSERT INTO "configuraciones_planilla" (
    "empresa_id", "vigente_desde", "tasa_isss_laboral", "tasa_isss_patronal", "techo_isss", "tasa_afp_laboral", "tasa_afp_patronal"
  )
  SELECT "id", DATE '2026-01-01', 3.00, 7.50, 1000.00, 7.25, 8.75 FROM "empresas"
  ON CONFLICT ("empresa_id", "vigente_desde") DO NOTHING
  RETURNING "id", "empresa_id"
)
INSERT INTO "tramos_retencion_planilla" ("empresa_id", "configuracion_id", "orden", "desde", "hasta", "porcentaje", "cuota_fija")
SELECT n."empresa_id", n."id", t."orden", t."desde", t."hasta", t."porcentaje", t."cuota_fija"
FROM nuevas n
CROSS JOIN (VALUES
  (1, 0.00::numeric, 550.00::numeric, 0.00::numeric, 0.00::numeric),
  (2, 550.00::numeric, 895.24::numeric, 10.00::numeric, 17.67::numeric),
  (3, 895.24::numeric, 2038.10::numeric, 20.00::numeric, 60.00::numeric),
  (4, 2038.10::numeric, NULL::numeric, 30.00::numeric, 288.57::numeric)
) AS t("orden", "desde", "hasta", "porcentaje", "cuota_fija");
