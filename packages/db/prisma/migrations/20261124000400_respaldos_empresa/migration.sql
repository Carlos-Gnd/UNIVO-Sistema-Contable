-- HU-13, S3-T01: archivos de respaldo empresariales y por sucursal, con restauración limitada a empresas vacías.

CREATE TYPE "tipo_respaldo" AS ENUM ('empresa', 'sucursal');

CREATE TABLE "respaldos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "tipo" "tipo_respaldo" NOT NULL,
    "nombre_archivo" VARCHAR(200) NOT NULL,
    "contenido" JSONB NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "respaldos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "respaldos_tipo_sucursal_ck" CHECK (
      ("tipo" = 'empresa' AND "sucursal_id" IS NULL) OR
      ("tipo" = 'sucursal' AND "sucursal_id" IS NOT NULL)
    ),
    CONSTRAINT "respaldos_sha256_ck" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "respaldos_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "respaldos_sucursal_id_fkey"
      FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "respaldos_creado_por_fkey"
      FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "respaldos_empresa_id_creado_en_idx" ON "respaldos"("empresa_id", "creado_en" DESC);

COMMENT ON TYPE "tipo_respaldo" IS 'Alcance de un archivo de respaldo: empresa completa o una sucursal.';
COMMENT ON TABLE "respaldos" IS 'Archivos JSON inmutables de respaldo de una empresa o sucursal.';
COMMENT ON COLUMN "respaldos"."id" IS 'Identificador del respaldo.';
COMMENT ON COLUMN "respaldos"."empresa_id" IS 'Empresa propietaria del archivo.';
COMMENT ON COLUMN "respaldos"."sucursal_id" IS 'Sucursal incluida cuando el respaldo es parcial.';
COMMENT ON COLUMN "respaldos"."tipo" IS 'Indica si contiene la empresa completa o una sucursal.';
COMMENT ON COLUMN "respaldos"."nombre_archivo" IS 'Nombre del archivo JSON descargable.';
COMMENT ON COLUMN "respaldos"."contenido" IS 'Datos del respaldo en formato JSON versionado.';
COMMENT ON COLUMN "respaldos"."sha256" IS 'Huella SHA-256 del contenido JSON canónico.';
COMMENT ON COLUMN "respaldos"."creado_por" IS 'Usuario que generó el archivo.';
COMMENT ON COLUMN "respaldos"."creado_en" IS 'Fecha y hora de generación.';

CREATE FUNCTION interno.respaldos_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Los respaldos son inmutables: no se pueden modificar ni eliminar'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.sucursal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sucursales s
    WHERE s.id = NEW.sucursal_id AND s.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'La sucursal del respaldo debe pertenecer a la empresa'
      USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('app.usuario_id', true) IS DISTINCT FROM NEW.creado_por::text THEN
    RAISE EXCEPTION 'El usuario del respaldo debe coincidir con el usuario de la sesión'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "respaldos_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "respaldos"
  FOR EACH ROW EXECUTE FUNCTION interno.respaldos_validar();
CREATE TRIGGER "respaldos_bitacora"
  AFTER INSERT ON "respaldos"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.respaldos_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.respaldos_validar() IS 'Valida empresa, sucursal y autor; protege la inmutabilidad del respaldo.';

ALTER TABLE "respaldos" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "respaldos" FROM anon, authenticated;
  END IF;
END $$;
