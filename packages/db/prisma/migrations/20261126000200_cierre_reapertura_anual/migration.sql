-- HU-35 S3-T10 y HU-36 S3-T13: una partida activa por cierre/reapertura y bloqueo del ejercicio cerrado.

CREATE UNIQUE INDEX "partidas_cierre_anual_activa_unq"
  ON "partidas"("empresa_id", "origen_id")
  WHERE "origen" = 'cierre_anual' AND "origen_id" IS NOT NULL AND "estado" <> 'anulada';
COMMENT ON INDEX "partidas_cierre_anual_activa_unq" IS
  'Evita duplicar la partida activa de cierre anual de un ejercicio.';

CREATE UNIQUE INDEX "partidas_reapertura_anual_activa_unq"
  ON "partidas"("empresa_id", "origen_id")
  WHERE "origen" = 'reapertura_ejercicio' AND "origen_id" IS NOT NULL AND "estado" <> 'anulada';
COMMENT ON INDEX "partidas_reapertura_anual_activa_unq" IS
  'Evita duplicar la partida activa de reapertura de un ejercicio.';

CREATE FUNCTION interno.cierre_validar_ejercicio_abierto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.periodos p
    JOIN public.ejercicios e ON e.id = p.ejercicio_id AND e.empresa_id = p.empresa_id
    WHERE p.id = NEW.periodo_id
      AND p.empresa_id = NEW.empresa_id
      AND e.estado = 'cerrado'
  ) THEN
    RAISE EXCEPTION 'El ejercicio de la partida está cerrado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "partidas_validar_ejercicio_abierto"
  BEFORE INSERT OR UPDATE OF fecha, periodo_id, empresa_id ON "partidas"
  FOR EACH ROW EXECUTE FUNCTION interno.cierre_validar_ejercicio_abierto();

CREATE FUNCTION interno.cierre_validar_ejercicio_completo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_total integer;
  v_cerrados integer;
BEGIN
  IF OLD.estado = 'abierto' AND NEW.estado = 'cerrado' THEN
    SELECT count(*)::integer, count(*) FILTER (WHERE estado = 'cerrado')::integer
      INTO v_total, v_cerrados
      FROM public.periodos
      WHERE empresa_id = NEW.empresa_id AND ejercicio_id = NEW.id;
    IF v_total <> 12 OR v_cerrados <> 12 THEN
      RAISE EXCEPTION 'Cierre los doce períodos antes de cerrar el ejercicio'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.partidas p
      JOIN public.periodos per ON per.id = p.periodo_id
      WHERE p.empresa_id = NEW.empresa_id AND per.ejercicio_id = NEW.id AND p.estado = 'borrador'
    ) THEN
      RAISE EXCEPTION 'No se puede cerrar un ejercicio con partidas en borrador'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.partidas p
      JOIN public.periodos per ON per.id = p.periodo_id
      WHERE p.empresa_id = NEW.empresa_id
        AND per.ejercicio_id = NEW.id
        AND p.origen = 'cierre_anual'
        AND p.origen_id = NEW.id
        AND p.tipo = 'cierre'
        AND p.estado = 'contabilizada'
    ) THEN
      RAISE EXCEPTION 'Contabilice la partida de cierre anual antes de cerrar el ejercicio'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ejercicios_validar_cierre_completo"
  BEFORE UPDATE OF estado ON "ejercicios"
  FOR EACH ROW EXECUTE FUNCTION interno.cierre_validar_ejercicio_completo();

REVOKE ALL ON FUNCTION interno.cierre_validar_ejercicio_abierto() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.cierre_validar_ejercicio_completo() FROM PUBLIC;
COMMENT ON FUNCTION interno.cierre_validar_ejercicio_abierto() IS
  'HU-35: bloquea nuevas partidas en ejercicios anuales cerrados.';
COMMENT ON FUNCTION interno.cierre_validar_ejercicio_completo() IS
  'HU-35: exige doce períodos cerrados, sin borradores y la partida de cierre contabilizada.';
