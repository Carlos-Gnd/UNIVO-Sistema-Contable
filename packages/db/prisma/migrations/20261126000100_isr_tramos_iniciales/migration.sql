-- HU-34, S3-T07: carga la tabla anual oficial de persona natural confirmada en ASIGNACION.md.
-- Aplica a ejercicios existentes sin configuración y a los que se creen en adelante.

CREATE FUNCTION interno.isr_crear_configuracion_inicial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_configuracion uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.empresas
    WHERE id = NEW.empresa_id AND tipo_contribuyente = 'persona_natural'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.configuraciones_isr (empresa_id, ejercicio_anio, version)
  VALUES (NEW.empresa_id, NEW.anio, 1)
  ON CONFLICT (empresa_id, ejercicio_anio, version) DO NOTHING
  RETURNING id INTO v_configuracion;

  IF v_configuracion IS NOT NULL THEN
    INSERT INTO public.tramos_isr
      (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
    VALUES
      (NEW.empresa_id, v_configuracion, 1, 0.00, 6600.00, 0.00, 0.00),
      (NEW.empresa_id, v_configuracion, 2, 6600.00, 10742.86, 10.00, 212.12),
      (NEW.empresa_id, v_configuracion, 3, 10742.86, 24457.14, 20.00, 720.00),
      (NEW.empresa_id, v_configuracion, 4, 24457.14, NULL, 30.00, 3462.86);
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.isr_crear_configuracion_inicial() FROM PUBLIC;
COMMENT ON FUNCTION interno.isr_crear_configuracion_inicial() IS
  'HU-34: crea la configuración inicial oficial de ISR anual para personas naturales.';

CREATE TRIGGER ejercicios_isr_configuracion_inicial
  AFTER INSERT ON public.ejercicios
  FOR EACH ROW EXECUTE FUNCTION interno.isr_crear_configuracion_inicial();

WITH nuevas_configuraciones AS (
  INSERT INTO public.configuraciones_isr (empresa_id, ejercicio_anio, version)
  SELECT e.empresa_id, e.anio, 1
  FROM public.ejercicios e
  JOIN public.empresas em ON em.id = e.empresa_id
  WHERE em.tipo_contribuyente = 'persona_natural'
    AND NOT EXISTS (
      SELECT 1 FROM public.configuraciones_isr cfg
      WHERE cfg.empresa_id = e.empresa_id AND cfg.ejercicio_anio = e.anio
    )
  ON CONFLICT (empresa_id, ejercicio_anio, version) DO NOTHING
  RETURNING id, empresa_id
)
INSERT INTO public.tramos_isr
  (empresa_id, configuracion_id, orden, desde, hasta, porcentaje, cuota_fija)
SELECT n.empresa_id, n.id, t.orden, t.desde, t.hasta, t.porcentaje, t.cuota_fija
FROM nuevas_configuraciones n
CROSS JOIN (VALUES
  (1, 0.00::numeric, 6600.00::numeric, 0.00::numeric, 0.00::numeric),
  (2, 6600.00::numeric, 10742.86::numeric, 10.00::numeric, 212.12::numeric),
  (3, 10742.86::numeric, 24457.14::numeric, 20.00::numeric, 720.00::numeric),
  (4, 24457.14::numeric, NULL::numeric, 30.00::numeric, 3462.86::numeric)
) AS t(orden, desde, hasta, porcentaje, cuota_fija);
