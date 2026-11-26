-- Notas a los estados financieros (HU-44, S3-T31).
-- El sistema propone el texto de cada nota y llena sus cifras; el contador redacta el suyo. Cada vez que guarda,
-- la base conserva una versión nueva (historial inmutable): la vigente es la de número más alto. Las notas son
-- de la empresa y del ejercicio; la clave de cada una (entidad, politicas, efectivo…) la define la aplicación.

CREATE TABLE "notas_estados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "ejercicio_id" UUID NOT NULL,
    "clave" VARCHAR(30) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "texto" TEXT NOT NULL,
    "creado_por" UUID DEFAULT nullif(current_setting('app.usuario_id', true), '')::uuid,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_estados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notas_estados_clave_valida" CHECK ("clave" ~ '^[a-z][a-z0-9-]{1,29}$'),
    CONSTRAINT "notas_estados_texto_valido" CHECK (btrim("texto") <> '' AND char_length("texto") <= 5000)
);

CREATE UNIQUE INDEX "notas_estados_ejercicio_clave_version_key"
  ON "notas_estados"("empresa_id", "ejercicio_id", "clave", "version");

ALTER TABLE "notas_estados" ADD CONSTRAINT "notas_estados_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_estados" ADD CONSTRAINT "notas_estados_ejercicio_id_fkey"
  FOREIGN KEY ("ejercicio_id") REFERENCES "ejercicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "notas_estados" IS 'Texto redactado de cada nota a los estados financieros, por empresa y ejercicio. Cada guardado agrega una versión; el historial no se modifica.';
COMMENT ON COLUMN "notas_estados"."id" IS 'Identificador de la versión de la nota.';
COMMENT ON COLUMN "notas_estados"."empresa_id" IS 'Empresa a la que pertenece la nota.';
COMMENT ON COLUMN "notas_estados"."ejercicio_id" IS 'Ejercicio al que corresponden los estados con esta nota; debe ser de la misma empresa.';
COMMENT ON COLUMN "notas_estados"."clave" IS 'Clave de la nota en la plantilla del sistema (entidad, politicas, efectivo, inventarios, activo-fijo, obligaciones, capital).';
COMMENT ON COLUMN "notas_estados"."version" IS 'Número de versión de la nota; lo asigna la base (1, 2, 3…) y la vigente es la más alta.';
COMMENT ON COLUMN "notas_estados"."texto" IS 'Texto de la nota en esta versión: no puede quedar vacío ni pasar de 5,000 caracteres.';
COMMENT ON COLUMN "notas_estados"."creado_por" IS 'Usuario que guardó esta versión.';
COMMENT ON COLUMN "notas_estados"."creado_en" IS 'Fecha y hora en que se guardó esta versión.';

-- El ejercicio es de la empresa de la nota y la versión la numera la base, para que dos usuarios no la repitan.
CREATE FUNCTION interno.notas_estados_preparar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ejercicios e WHERE e.id = NEW.ejercicio_id AND e.empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'El ejercicio no pertenece a la empresa.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('notas_estados'), hashtext(NEW.ejercicio_id::text || NEW.clave));
  SELECT coalesce(max(n.version), 0) + 1 INTO NEW.version
    FROM notas_estados n
    WHERE n.empresa_id = NEW.empresa_id AND n.ejercicio_id = NEW.ejercicio_id AND n.clave = NEW.clave;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.notas_estados_inmutables() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de las notas a los estados es inmutable: no se puede modificar, borrar ni vaciar';
END $$;

REVOKE ALL ON FUNCTION interno.notas_estados_preparar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.notas_estados_inmutables() FROM PUBLIC;

COMMENT ON FUNCTION interno.notas_estados_preparar() IS 'Trigger de notas_estados: valida que el ejercicio sea de la empresa y numera la versión.';
COMMENT ON FUNCTION interno.notas_estados_inmutables() IS 'Trigger de notas_estados: el historial de versiones no se modifica ni se borra.';

CREATE TRIGGER "notas_estados_preparar_antes" BEFORE INSERT ON "notas_estados"
  FOR EACH ROW EXECUTE FUNCTION interno.notas_estados_preparar();
CREATE TRIGGER "notas_estados_sin_cambios" BEFORE UPDATE OR DELETE ON "notas_estados"
  FOR EACH ROW EXECUTE FUNCTION interno.notas_estados_inmutables();
CREATE TRIGGER "notas_estados_sin_vaciar" BEFORE TRUNCATE ON "notas_estados"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.notas_estados_inmutables();
CREATE TRIGGER "notas_estados_bitacora" AFTER INSERT ON "notas_estados"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Como el resto de tablas, no es visible para la API de datos de Supabase
ALTER TABLE "notas_estados" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "notas_estados" FROM anon, authenticated;
  END IF;
END $$;
