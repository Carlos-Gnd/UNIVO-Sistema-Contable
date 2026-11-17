-- Reglas de sucursales en la base (HU-07). La API ya las aplica (#211); aquí se garantizan aunque se
-- escriba por otra vía (scripts, semilla, futuros módulos).

-- Una sola casa matriz por empresa.
CREATE UNIQUE INDEX "sucursales_una_matriz_por_empresa" ON "sucursales" ("empresa_id") WHERE "es_matriz";

-- La casa matriz no se inactiva: toda empresa conserva al menos una sucursal activa.
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_matriz_activa" CHECK (NOT "es_matriz" OR "activa");

-- No se registran partidas nuevas en una sucursal inactiva, ni se mueve una partida a una sucursal inactiva.
-- Las partidas que ya estaban en la sucursal se pueden seguir editando, contabilizando y anulando, y su
-- reversión se registra en la misma sucursal: así se cierran los pendientes de una sucursal que se dio de baja.
CREATE FUNCTION interno.partidas_sucursal_activa() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.tipo = 'reversion' AND NEW.partida_revertida_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.sucursal_id = OLD.sucursal_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND NOT activa) THEN
    RAISE EXCEPTION 'La sucursal está inactiva; no se registran partidas nuevas en ella';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.partidas_sucursal_activa() FROM PUBLIC;

-- Se dispara después de partidas_antes_guardar (orden alfabético), que ya validó que la sucursal es de la empresa.
CREATE TRIGGER partidas_sucursal_activa BEFORE INSERT OR UPDATE OF sucursal_id ON partidas
  FOR EACH ROW EXECUTE FUNCTION interno.partidas_sucursal_activa();

COMMENT ON INDEX "sucursales_una_matriz_por_empresa" IS 'Una sola casa matriz por empresa.';
COMMENT ON CONSTRAINT "sucursales_matriz_activa" ON "sucursales" IS 'La casa matriz no se puede inactivar.';
COMMENT ON FUNCTION interno.partidas_sucursal_activa() IS 'Trigger de partidas: impide registrar partidas nuevas en una sucursal inactiva (salvo la reversión de una existente).';
