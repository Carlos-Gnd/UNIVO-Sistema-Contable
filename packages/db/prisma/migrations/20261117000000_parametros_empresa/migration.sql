-- Parámetros contables de la empresa (HU-12, S2-T01).
-- La numeración de partidas (modo_numeracion) ya existía; se suman el formato de los estados financieros y el
-- método de valuación y sistema de inventario por defecto. Los que afectan cálculos se bloquean cuando la
-- empresa ya tiene movimientos, para no cambiar las reglas con las que se registraron las partidas.

CREATE TYPE "formato_estados" AS ENUM ('clase', 'niif_pymes');
CREATE TYPE "metodo_valuacion" AS ENUM ('promedio_ponderado', 'peps');
CREATE TYPE "sistema_inventario" AS ENUM ('perpetuo', 'analitico');

ALTER TABLE "empresas"
  ADD COLUMN "formato_estados" "formato_estados" NOT NULL DEFAULT 'clase',
  ADD COLUMN "metodo_valuacion" "metodo_valuacion" NOT NULL DEFAULT 'promedio_ponderado',
  ADD COLUMN "sistema_inventario" "sistema_inventario" NOT NULL DEFAULT 'perpetuo';

COMMENT ON COLUMN "empresas"."formato_estados" IS 'Formato de los estados financieros: de clase o NIIF para las PYMES. No afecta cálculos, se puede cambiar siempre.';
COMMENT ON COLUMN "empresas"."metodo_valuacion" IS 'Método de valuación del inventario por defecto: promedio ponderado o PEPS. Se bloquea cuando ya hay movimientos.';
COMMENT ON COLUMN "empresas"."sistema_inventario" IS 'Sistema de inventario: perpetuo o analítico. Se bloquea cuando ya hay movimientos.';

-- Hay movimientos cuando la empresa ya tiene alguna partida contabilizada o anulada (con número asignado).
-- Los borradores no cuentan: se pueden descartar sin dejar rastro contable.
CREATE FUNCTION interno.empresa_tiene_movimientos(p_empresa uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM partidas WHERE empresa_id = p_empresa AND estado <> 'borrador');
$$;

REVOKE ALL ON FUNCTION interno.empresa_tiene_movimientos(uuid) FROM PUBLIC;

CREATE FUNCTION interno.empresas_parametros_bloqueados() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  cambiados text[] := ARRAY[]::text[];
BEGIN
  IF NEW.modo_numeracion IS DISTINCT FROM OLD.modo_numeracion THEN cambiados := array_append(cambiados, 'modo_numeracion'::text); END IF;
  IF NEW.metodo_valuacion IS DISTINCT FROM OLD.metodo_valuacion THEN cambiados := array_append(cambiados, 'metodo_valuacion'::text); END IF;
  IF NEW.sistema_inventario IS DISTINCT FROM OLD.sistema_inventario THEN cambiados := array_append(cambiados, 'sistema_inventario'::text); END IF;
  IF cardinality(cambiados) > 0 AND interno.empresa_tiene_movimientos(OLD.id) THEN
    RAISE EXCEPTION 'La empresa ya tiene movimientos: no se puede cambiar %', array_to_string(cambiados, ', ');
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.empresas_parametros_bloqueados() FROM PUBLIC;

CREATE TRIGGER empresas_parametros_bloqueados BEFORE UPDATE OF modo_numeracion, metodo_valuacion, sistema_inventario ON "empresas"
  FOR EACH ROW EXECUTE FUNCTION interno.empresas_parametros_bloqueados();

COMMENT ON FUNCTION interno.empresa_tiene_movimientos(uuid) IS 'Indica si la empresa tiene partidas contabilizadas o anuladas.';
COMMENT ON FUNCTION interno.empresas_parametros_bloqueados() IS 'Trigger de empresas: impide cambiar la numeración, el método de valuación y el sistema de inventario cuando ya hay movimientos.';
