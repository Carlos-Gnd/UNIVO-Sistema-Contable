-- HU-34, S3-T07: configuraciones anuales de ISR por empresa y tramos progresivos.
-- Las tarifas son explícitas por ejercicio; no se insertan valores fiscales por defecto.

CREATE TABLE "configuraciones_isr" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "ejercicio_anio" SMALLINT NOT NULL,
    "version" SMALLINT NOT NULL,
    "tasa_sociedad" DECIMAL(5,2),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuraciones_isr_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuraciones_isr_version_positiva" CHECK ("version" BETWEEN 1 AND 32767),
    CONSTRAINT "configuraciones_isr_tasa_sociedad_rango" CHECK ("tasa_sociedad" IS NULL OR "tasa_sociedad" BETWEEN 0 AND 100)
);

CREATE TABLE "tramos_isr" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "configuracion_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "desde" DECIMAL(14,2) NOT NULL,
    "hasta" DECIMAL(14,2),
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "cuota_fija" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "tramos_isr_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tramos_isr_orden_rango" CHECK ("orden" BETWEEN 1 AND 20),
    CONSTRAINT "tramos_isr_desde_no_negativo" CHECK ("desde" >= 0),
    CONSTRAINT "tramos_isr_limite_superior_mayor" CHECK ("hasta" IS NULL OR "hasta" > "desde"),
    CONSTRAINT "tramos_isr_porcentaje_rango" CHECK ("porcentaje" BETWEEN 0 AND 100),
    CONSTRAINT "tramos_isr_cuota_no_negativa" CHECK ("cuota_fija" >= 0)
);

CREATE UNIQUE INDEX "configuraciones_isr_id_empresa_id_key"
  ON "configuraciones_isr"("id", "empresa_id");
CREATE UNIQUE INDEX "configuraciones_isr_empresa_anio_version_key"
  ON "configuraciones_isr"("empresa_id", "ejercicio_anio", "version");
CREATE INDEX "configuraciones_isr_empresa_anio_version_idx"
  ON "configuraciones_isr"("empresa_id", "ejercicio_anio", "version");
CREATE UNIQUE INDEX "tramos_isr_configuracion_orden_key"
  ON "tramos_isr"("configuracion_id", "orden");
CREATE INDEX "tramos_isr_empresa_configuracion_idx"
  ON "tramos_isr"("empresa_id", "configuracion_id");
CREATE UNIQUE INDEX "partidas_isr_configuracion_activa_unq"
  ON "partidas"("empresa_id", "origen_id")
  WHERE "origen" = 'isr_ejercicio' AND "origen_id" IS NOT NULL AND "estado" <> 'anulada';
COMMENT ON INDEX "partidas_isr_configuracion_activa_unq" IS 'Evita más de una provisión activa de ISR por configuración del ejercicio.';

ALTER TABLE "configuraciones_isr" ADD CONSTRAINT "configuraciones_isr_empresa_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "configuraciones_isr" ADD CONSTRAINT "configuraciones_isr_ejercicio_empresa_fkey"
  FOREIGN KEY ("empresa_id", "ejercicio_anio") REFERENCES "ejercicios"("empresa_id", "anio") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tramos_isr" ADD CONSTRAINT "tramos_isr_empresa_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tramos_isr" ADD CONSTRAINT "tramos_isr_configuracion_empresa_fkey"
  FOREIGN KEY ("configuracion_id", "empresa_id") REFERENCES "configuraciones_isr"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "configuraciones_isr" IS 'Versiones de tasas y tramos de ISR configurados para cada ejercicio de una empresa.';
COMMENT ON COLUMN "configuraciones_isr"."id" IS 'Identificador de la versión de configuración anual del ISR.';
COMMENT ON COLUMN "configuraciones_isr"."empresa_id" IS 'Empresa a la que pertenece la configuración.';
COMMENT ON COLUMN "configuraciones_isr"."ejercicio_anio" IS 'Año del ejercicio al que aplica la configuración.';
COMMENT ON COLUMN "configuraciones_isr"."version" IS 'Número consecutivo de versión dentro del ejercicio.';
COMMENT ON COLUMN "configuraciones_isr"."tasa_sociedad" IS 'Tasa porcentual configurable para el cálculo del ISR de sociedades.';
COMMENT ON COLUMN "configuraciones_isr"."creado_en" IS 'Fecha y hora en que se creó la versión.';

COMMENT ON TABLE "tramos_isr" IS 'Tramos progresivos anuales configurados para el ISR de personas naturales.';
COMMENT ON COLUMN "tramos_isr"."id" IS 'Identificador del tramo.';
COMMENT ON COLUMN "tramos_isr"."empresa_id" IS 'Empresa propietaria de la configuración.';
COMMENT ON COLUMN "tramos_isr"."configuracion_id" IS 'Versión de configuración anual a la que pertenece el tramo.';
COMMENT ON COLUMN "tramos_isr"."orden" IS 'Posición del tramo en la secuencia progresiva.';
COMMENT ON COLUMN "tramos_isr"."desde" IS 'Límite inferior del tramo; el primer tramo empieza en cero.';
COMMENT ON COLUMN "tramos_isr"."hasta" IS 'Límite superior inclusivo; nulo identifica el último tramo.';
COMMENT ON COLUMN "tramos_isr"."porcentaje" IS 'Porcentaje marginal aplicado al exceso sobre el límite inferior.';
COMMENT ON COLUMN "tramos_isr"."cuota_fija" IS 'Cuota fija que se suma al porcentaje marginal.';

CREATE FUNCTION interno.isr_bloquear_cambios() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'La configuración anual del ISR es inmutable; registra una nueva versión'
    USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION interno.isr_bloquear_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'No se permite vaciar el historial de configuración anual del ISR'
    USING ERRCODE = 'check_violation';
END $$;

CREATE FUNCTION interno.isr_validar_configuracion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_configuracion uuid;
  v_tipo tipo_contribuyente;
  v_tasa_sociedad numeric(5,2);
  v_total integer;
  v_orden integer := 0;
  v_limite_anterior numeric(14,2);
  v_tramo record;
BEGIN
  IF TG_TABLE_NAME = 'configuraciones_isr' THEN
    v_configuracion := NEW.id;
  ELSE
    v_configuracion := NEW.configuracion_id;
  END IF;

  SELECT e.tipo_contribuyente, cfg.tasa_sociedad
    INTO v_tipo, v_tasa_sociedad
    FROM public.configuraciones_isr cfg
    JOIN public.empresas e ON e.id = cfg.empresa_id
    WHERE cfg.id = v_configuracion;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la configuración anual del ISR'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.tramos_isr WHERE configuracion_id = v_configuracion;

  IF v_tipo = 'persona_natural' THEN
    IF v_tasa_sociedad IS NOT NULL OR v_total < 1 OR v_total > 20 THEN
      RAISE EXCEPTION 'La persona natural requiere tramos progresivos y no usa tasa de sociedad'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF v_tasa_sociedad IS NULL OR v_total <> 0 THEN
      RAISE EXCEPTION 'La sociedad requiere una tasa y no usa tramos de persona natural'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
  END IF;

  FOR v_tramo IN
    SELECT orden, desde, hasta FROM public.tramos_isr
    WHERE configuracion_id = v_configuracion ORDER BY orden
  LOOP
    v_orden := v_orden + 1;
    IF v_tramo.orden <> v_orden THEN
      RAISE EXCEPTION 'Los tramos anuales del ISR deben tener orden consecutivo desde uno'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden = 1 AND v_tramo.desde <> 0 THEN
      RAISE EXCEPTION 'El primer tramo anual del ISR debe comenzar en cero'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden > 1 AND v_limite_anterior IS NULL THEN
      RAISE EXCEPTION 'Solo el último tramo anual del ISR puede quedar abierto'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden > 1 AND v_tramo.desde <> v_limite_anterior THEN
      RAISE EXCEPTION 'Los tramos anuales del ISR deben ser continuos y sin traslapes'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden < v_total AND v_tramo.hasta IS NULL THEN
      RAISE EXCEPTION 'Solo el último tramo anual del ISR puede quedar abierto'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_orden = v_total AND v_tramo.hasta IS NOT NULL THEN
      RAISE EXCEPTION 'El último tramo anual del ISR debe quedar abierto'
        USING ERRCODE = 'check_violation';
    END IF;
    v_limite_anterior := v_tramo.hasta;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER "configuraciones_isr_inmutables"
  BEFORE UPDATE OR DELETE ON "configuraciones_isr"
  FOR EACH ROW EXECUTE FUNCTION interno.isr_bloquear_cambios();
CREATE TRIGGER "tramos_isr_inmutables"
  BEFORE UPDATE OR DELETE ON "tramos_isr"
  FOR EACH ROW EXECUTE FUNCTION interno.isr_bloquear_cambios();
CREATE TRIGGER "configuraciones_isr_no_truncate"
  BEFORE TRUNCATE ON "configuraciones_isr"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.isr_bloquear_truncate();
CREATE TRIGGER "tramos_isr_no_truncate"
  BEFORE TRUNCATE ON "tramos_isr"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.isr_bloquear_truncate();

CREATE CONSTRAINT TRIGGER "configuraciones_isr_validar_completo"
  AFTER INSERT ON "configuraciones_isr" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interno.isr_validar_configuracion();
CREATE CONSTRAINT TRIGGER "tramos_isr_validar_continuidad"
  AFTER INSERT ON "tramos_isr" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interno.isr_validar_configuracion();

CREATE TRIGGER "configuraciones_isr_bitacora"
  AFTER INSERT ON "configuraciones_isr"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "tramos_isr_bitacora"
  AFTER INSERT ON "tramos_isr"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.isr_bloquear_cambios() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.isr_bloquear_truncate() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.isr_validar_configuracion() FROM PUBLIC;
COMMENT ON FUNCTION interno.isr_bloquear_cambios() IS 'Trigger de ISR: conserva las versiones y sus tramos sin cambios.';
COMMENT ON FUNCTION interno.isr_bloquear_truncate() IS 'Trigger de ISR: impide borrar el historial completo.';
COMMENT ON FUNCTION interno.isr_validar_configuracion() IS 'Trigger de ISR: verifica tipo de contribuyente y continuidad de tramos.';

ALTER TABLE "configuraciones_isr" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tramos_isr" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "configuraciones_isr", "tramos_isr" FROM anon, authenticated;
  END IF;
END $$;
