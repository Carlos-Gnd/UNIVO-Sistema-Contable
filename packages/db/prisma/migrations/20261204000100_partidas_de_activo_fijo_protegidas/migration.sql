-- Las partidas generadas por el módulo de activo fijo (origen activo_fijo y depreciacion) no se anulan ni se
-- editan desde contabilidad: activos_fijos y depreciaciones no se enterarían y quedarían desfasados. El camino es la
-- baja del activo. Aplica solo a partidas contabilizadas; mientras son borrador el módulo las arma sin restricción.

CREATE FUNCTION interno.partida_de_activo_fijo_protegida(p_origen text, p_estado estado_partida) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_origen IN ('activo_fijo', 'depreciacion') AND p_estado = 'contabilizada';
$$;

REVOKE ALL ON FUNCTION interno.partida_de_activo_fijo_protegida(text, estado_partida) FROM PUBLIC;
COMMENT ON FUNCTION interno.partida_de_activo_fijo_protegida(text, estado_partida) IS 'Indica si una partida contabilizada fue generada por activo fijo o depreciación y por tanto no se anula ni se edita desde contabilidad.';

CREATE FUNCTION interno.partidas_de_activo_fijo_sin_cambios() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF interno.partida_de_activo_fijo_protegida(OLD.origen, OLD.estado) THEN
    RAISE EXCEPTION 'La partida proviene de activos fijos y no se anula ni se edita desde contabilidad: use la baja del activo';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.partidas_de_activo_fijo_sin_cambios() FROM PUBLIC;
COMMENT ON FUNCTION interno.partidas_de_activo_fijo_sin_cambios() IS 'Trigger de partidas: rechaza anular o editar una partida contabilizada de activo fijo o depreciación.';

CREATE TRIGGER partidas_de_activo_fijo_sin_cambios BEFORE UPDATE ON partidas
  FOR EACH ROW EXECUTE FUNCTION interno.partidas_de_activo_fijo_sin_cambios();

CREATE FUNCTION interno.detalles_de_activo_fijo_sin_cambios() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  p record;
BEGIN
  SELECT origen, estado INTO p FROM partidas WHERE id = COALESCE(OLD.partida_id, NEW.partida_id);
  IF FOUND AND interno.partida_de_activo_fijo_protegida(p.origen, p.estado) THEN
    RAISE EXCEPTION 'La partida proviene de activos fijos y no se anula ni se edita desde contabilidad: use la baja del activo';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION interno.detalles_de_activo_fijo_sin_cambios() FROM PUBLIC;
COMMENT ON FUNCTION interno.detalles_de_activo_fijo_sin_cambios() IS 'Trigger de partida_detalles: rechaza cambiar las líneas de una partida contabilizada de activo fijo o depreciación.';

CREATE TRIGGER detalles_de_activo_fijo_sin_cambios BEFORE INSERT OR UPDATE OR DELETE ON partida_detalles
  FOR EACH ROW EXECUTE FUNCTION interno.detalles_de_activo_fijo_sin_cambios();
