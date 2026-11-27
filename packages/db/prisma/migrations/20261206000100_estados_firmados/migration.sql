-- Firma digital de estados financieros (HU-87, S4-T31) y portal de verificación (HU-88, S4-T34).
-- Cada firma guarda quién firmó, con qué certificado y la huella SHA-256 del PDF firmado; el código de verificación
-- va en el QR del PDF y el portal público lo consulta sin iniciar sesión. El PDF se guarda aparte (sin bitácora)
-- para poder volver a descargarlo. Nada de esto se modifica ni se borra.

CREATE TABLE "estados_firmados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo_verificacion" VARCHAR(14) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "periodo" VARCHAR(150) NOT NULL,
    "firmante_id" UUID NOT NULL,
    "firmante_nombre" VARCHAR(150) NOT NULL,
    "cargo" VARCHAR(100) NOT NULL,
    "certificado_id" UUID NOT NULL,
    "huella_documento" CHAR(64) NOT NULL,
    "firmado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estados_firmados_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "estados_firmados_codigo_check" CHECK ("codigo_verificacion" ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$')
);

CREATE UNIQUE INDEX "estados_firmados_codigo_verificacion_key" ON "estados_firmados"("codigo_verificacion");
CREATE INDEX "estados_firmados_lista_idx" ON "estados_firmados"("empresa_id", "firmado_en");
CREATE INDEX "estados_firmados_firmante_idx" ON "estados_firmados"("firmante_id");
CREATE INDEX "estados_firmados_certificado_idx" ON "estados_firmados"("certificado_id");

ALTER TABLE "estados_firmados" ADD CONSTRAINT "estados_firmados_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estados_firmados" ADD CONSTRAINT "estados_firmados_firmante_id_fkey"
  FOREIGN KEY ("firmante_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estados_firmados" ADD CONSTRAINT "estados_firmados_certificado_id_fkey"
  FOREIGN KEY ("certificado_id") REFERENCES "certificados_firma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "estados_firmados" IS 'Estados financieros firmados digitalmente (HU-87) y verificables en el portal público (HU-88).';
COMMENT ON COLUMN "estados_firmados"."id" IS 'Identificador de la firma.';
COMMENT ON COLUMN "estados_firmados"."empresa_id" IS 'Empresa del estado financiero.';
COMMENT ON COLUMN "estados_firmados"."codigo_verificacion" IS 'Código que lleva el QR y se consulta en el portal de verificación (XXXX-XXXX-XXXX).';
COMMENT ON COLUMN "estados_firmados"."titulo" IS 'Estado firmado, por ejemplo Balance general.';
COMMENT ON COLUMN "estados_firmados"."periodo" IS 'Período o fecha de corte del estado, como figura en el documento.';
COMMENT ON COLUMN "estados_firmados"."firmante_id" IS 'Usuario que firmó.';
COMMENT ON COLUMN "estados_firmados"."firmante_nombre" IS 'Nombre del firmante al momento de firmar.';
COMMENT ON COLUMN "estados_firmados"."cargo" IS 'Calidad en que firma (contador, representante legal…).';
COMMENT ON COLUMN "estados_firmados"."certificado_id" IS 'Certificado del firmante con que se firmó.';
COMMENT ON COLUMN "estados_firmados"."huella_documento" IS 'SHA-256 del PDF firmado: un archivo con otra huella no es el original.';
COMMENT ON COLUMN "estados_firmados"."firmado_en" IS 'Fecha y hora de la firma.';

CREATE TABLE "estados_firmados_archivos" (
    "estado_firmado_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "pdf" BYTEA NOT NULL,

    CONSTRAINT "estados_firmados_archivos_pkey" PRIMARY KEY ("estado_firmado_id")
);

CREATE INDEX "estados_firmados_archivos_empresa_idx" ON "estados_firmados_archivos"("empresa_id");

ALTER TABLE "estados_firmados_archivos" ADD CONSTRAINT "estados_firmados_archivos_estado_fkey"
  FOREIGN KEY ("estado_firmado_id") REFERENCES "estados_firmados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "estados_firmados_archivos" ADD CONSTRAINT "estados_firmados_archivos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "estados_firmados_archivos" IS 'PDF firmado de cada estado financiero, para descargarlo de nuevo.';
COMMENT ON COLUMN "estados_firmados_archivos"."estado_firmado_id" IS 'Firma a la que pertenece el archivo.';
COMMENT ON COLUMN "estados_firmados_archivos"."empresa_id" IS 'Empresa del estado financiero.';
COMMENT ON COLUMN "estados_firmados_archivos"."pdf" IS 'PDF con la firma visible y la firma digital PAdES.';

-- Una firma es una constancia: no se modifica ni se borra
CREATE FUNCTION interno.estados_firmados_inmutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Un estado financiero firmado no se modifica ni se borra' USING ERRCODE = 'check_violation';
END $$;

COMMENT ON FUNCTION interno.estados_firmados_inmutable() IS 'Impide modificar o borrar un estado financiero firmado o su archivo.';

CREATE TRIGGER estados_firmados_inmutable BEFORE UPDATE OR DELETE ON "estados_firmados"
  FOR EACH ROW EXECUTE FUNCTION interno.estados_firmados_inmutable();
CREATE TRIGGER estados_firmados_archivos_inmutable BEFORE UPDATE OR DELETE ON "estados_firmados_archivos"
  FOR EACH ROW EXECUTE FUNCTION interno.estados_firmados_inmutable();

CREATE TRIGGER estados_firmados_bitacora AFTER INSERT OR UPDATE OR DELETE ON "estados_firmados"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "estados_firmados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "estados_firmados_archivos" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "estados_firmados", "estados_firmados_archivos" FROM anon, authenticated;
  END IF;
END $$;
