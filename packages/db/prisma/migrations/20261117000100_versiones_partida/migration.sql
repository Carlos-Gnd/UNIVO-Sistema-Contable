-- Historial de versiones de las partidas contabilizadas (HU-23, S2-T05).
-- Cada vez que se edita una partida contabilizada, la base guarda cómo estaba antes (cabecera y líneas) en
-- partida_versiones. La versión actual sigue en partidas y partida_detalles; las anteriores se consultan aquí.
-- Las ediciones en períodos cerrados ya las rechazan los triggers de partidas y de detalles.

CREATE TABLE "partida_versiones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "partida_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "datos" JSONB NOT NULL,
    "lineas" JSONB NOT NULL,
    "reemplazada_por" UUID,
    "reemplazada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partida_versiones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partida_versiones_partida_id_version_key" ON "partida_versiones"("partida_id", "version");
CREATE INDEX "partida_versiones_empresa_id_idx" ON "partida_versiones"("empresa_id");

ALTER TABLE "partida_versiones" ADD CONSTRAINT "partida_versiones_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partida_versiones" ADD CONSTRAINT "partida_versiones_partida_id_fkey"
  FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "partida_versiones" IS 'Versiones anteriores de las partidas contabilizadas que se editaron: cómo estaban antes de cada edición.';
COMMENT ON COLUMN "partida_versiones"."id" IS 'Identificador de la versión guardada.';
COMMENT ON COLUMN "partida_versiones"."empresa_id" IS 'Empresa de la partida.';
COMMENT ON COLUMN "partida_versiones"."partida_id" IS 'Partida a la que pertenece esta versión.';
COMMENT ON COLUMN "partida_versiones"."version" IS 'Número de versión que tenía la partida antes de la edición (la actual está en partidas.version).';
COMMENT ON COLUMN "partida_versiones"."datos" IS 'Cabecera de la partida como estaba en esa versión.';
COMMENT ON COLUMN "partida_versiones"."lineas" IS 'Líneas de la partida en esa versión: cuenta_id, codigo, nombre, concepto, debe, haber y orden.';
COMMENT ON COLUMN "partida_versiones"."reemplazada_por" IS 'Usuario que editó la partida y dejó esta versión como anterior.';
COMMENT ON COLUMN "partida_versiones"."reemplazada_en" IS 'Fecha y hora en que se editó la partida.';

-- Guarda la versión actual de la partida antes de su primera modificación en la transacción. Se llama desde los
-- triggers de la cabecera y de las líneas: da igual cuál se modifique primero, la versión guardada es la anterior.
-- No guarda nada si la partida no está contabilizada, o si se creó en esta misma transacción (todavía no existía
-- como versión confirmada), ni vuelve a guardar si ya lo hizo en la transacción.
CREATE FUNCTION interno.guardar_version_partida(p_partida uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  marca text := 'app.version_guardada_' || replace(p_partida::text, '-', '_');
  p partidas%ROWTYPE;
  creada_en bigint;
BEGIN
  IF coalesce(current_setting(marca, true), '') = 'si' THEN
    RETURN;
  END IF;
  SELECT * INTO p FROM partidas WHERE id = p_partida;
  IF NOT FOUND OR p.estado <> 'contabilizada' THEN
    RETURN;
  END IF;
  SELECT xmin::text::bigint INTO creada_en FROM partidas WHERE id = p_partida;
  IF creada_en = (pg_current_xact_id()::text::bigint & 4294967295) THEN
    RETURN;
  END IF;

  INSERT INTO partida_versiones (empresa_id, partida_id, version, datos, lineas, reemplazada_por)
  VALUES (
    p.empresa_id, p.id, p.version, to_jsonb(p),
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'cuenta_id', d.cuenta_id, 'codigo', c.codigo, 'nombre', c.nombre, 'concepto', d.concepto,
              'debe', d.debe::text, 'haber', d.haber::text, 'orden', d.orden) ORDER BY d.orden, d.id), '[]'::jsonb)
     FROM partida_detalles d JOIN cuentas c ON c.id = d.cuenta_id WHERE d.partida_id = p.id),
    nullif(current_setting('app.usuario_id', true), '')::uuid)
  ON CONFLICT (partida_id, version) DO NOTHING;
  PERFORM set_config(marca, 'si', true);
END $$;

REVOKE ALL ON FUNCTION interno.guardar_version_partida(uuid) FROM PUBLIC;

CREATE FUNCTION interno.partidas_versionar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM interno.guardar_version_partida(OLD.id);
  RETURN NEW;
END $$;

-- Solo cuando una partida contabilizada sigue contabilizada: contabilizar y anular no son ediciones.
-- Se dispara después de partidas_antes_guardar (orden alfabético), que ya validó el período y la anulación.
CREATE TRIGGER partidas_versionar BEFORE UPDATE ON partidas
  FOR EACH ROW WHEN (OLD.estado = 'contabilizada' AND NEW.estado = 'contabilizada')
  EXECUTE FUNCTION interno.partidas_versionar();

CREATE FUNCTION interno.detalles_versionar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM interno.guardar_version_partida(CASE WHEN TG_OP = 'DELETE' THEN OLD.partida_id ELSE NEW.partida_id END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- Se dispara después de detalles_antes_guardar (orden alfabético), que ya validó período y anulación.
CREATE TRIGGER detalles_versionar BEFORE INSERT OR UPDATE OR DELETE ON partida_detalles
  FOR EACH ROW EXECUTE FUNCTION interno.detalles_versionar();

-- El historial no se modifica ni se borra.
CREATE FUNCTION interno.versiones_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de versiones de las partidas es inmutable: no se puede modificar, borrar ni vaciar';
END $$;

CREATE TRIGGER partida_versiones_sin_cambios BEFORE UPDATE OR DELETE ON partida_versiones
  FOR EACH ROW EXECUTE FUNCTION interno.versiones_inmutables();
CREATE TRIGGER partida_versiones_sin_vaciar BEFORE TRUNCATE ON partida_versiones
  FOR EACH STATEMENT EXECUTE FUNCTION interno.versiones_inmutables();

REVOKE ALL ON FUNCTION interno.partidas_versionar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.detalles_versionar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.versiones_inmutables() FROM PUBLIC;

COMMENT ON FUNCTION interno.guardar_version_partida(uuid) IS 'Guarda en partida_versiones cómo estaba una partida contabilizada antes de su primera modificación en la transacción.';
COMMENT ON FUNCTION interno.partidas_versionar() IS 'Trigger de partidas: guarda la versión anterior al editar una partida contabilizada.';
COMMENT ON FUNCTION interno.detalles_versionar() IS 'Trigger de partida_detalles: guarda la versión anterior si se modifican líneas de una partida contabilizada antes que su cabecera.';
COMMENT ON FUNCTION interno.versiones_inmutables() IS 'Trigger de partida_versiones: el historial no se modifica ni se borra.';

-- Como el resto de tablas, no es visible para la API de datos de Supabase
ALTER TABLE "partida_versiones" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "partida_versiones" FROM anon, authenticated;
  END IF;
END $$;
