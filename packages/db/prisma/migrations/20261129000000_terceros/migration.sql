-- Clientes y proveedores (HU-58, S3-T58).
-- Un solo registro por tercero de la empresa: puede ser cliente, proveedor o ambos. El NIT y el NRC son únicos por
-- empresa y se guardan con formato válido; la clasificación (grande, mediano u otro contribuyente) decide la
-- retención y percepción del 1 % de IVA en compras y ventas (HU-59, HU-60). Los cambios quedan en la bitácora.

CREATE TABLE "terceros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "nit" VARCHAR(17) NOT NULL,
    "nrc" VARCHAR(10),
    "actividad_economica" VARCHAR(200),
    "clasificacion" "clasificacion_contribuyente" NOT NULL DEFAULT 'otro',
    "direccion" VARCHAR(300),
    "telefono" VARCHAR(20),
    "correo" VARCHAR(150),
    "es_cliente" BOOLEAN NOT NULL DEFAULT false,
    "es_proveedor" BOOLEAN NOT NULL DEFAULT false,
    "dias_credito" SMALLINT NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terceros_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "terceros_es_cliente_o_proveedor" CHECK ("es_cliente" OR "es_proveedor"),
    CONSTRAINT "terceros_nit_formato" CHECK ("nit" ~ '^(\d{4}-\d{6}-\d{3}-\d|\d{8}-\d)$'),
    CONSTRAINT "terceros_nrc_formato" CHECK ("nrc" IS NULL OR "nrc" ~ '^\d{1,8}-\d$'),
    CONSTRAINT "terceros_dias_credito_rango" CHECK ("dias_credito" BETWEEN 0 AND 365)
);

CREATE UNIQUE INDEX "terceros_id_empresa_id_key" ON "terceros"("id", "empresa_id");
CREATE UNIQUE INDEX "terceros_empresa_id_nit_key" ON "terceros"("empresa_id", "nit");
CREATE UNIQUE INDEX "terceros_empresa_id_nrc_key" ON "terceros"("empresa_id", "nrc");
CREATE INDEX "terceros_empresa_id_nombre_idx" ON "terceros"("empresa_id", "nombre");

ALTER TABLE "terceros" ADD CONSTRAINT "terceros_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "terceros" IS 'Clientes y proveedores de la empresa; una misma persona o sociedad puede ser ambos. Las compras, ventas y libros de IVA los usan.';
COMMENT ON COLUMN "terceros"."id" IS 'Identificador del cliente o proveedor.';
COMMENT ON COLUMN "terceros"."empresa_id" IS 'Empresa dueña del registro.';
COMMENT ON COLUMN "terceros"."nombre" IS 'Nombre o razón social.';
COMMENT ON COLUMN "terceros"."nit" IS 'NIT (0000-000000-000-0) o DUI (00000000-0) con formato; único por empresa.';
COMMENT ON COLUMN "terceros"."nrc" IS 'Número de Registro de Contribuyente (IVA); único por empresa. Los comprobantes de crédito fiscal lo exigen.';
COMMENT ON COLUMN "terceros"."actividad_economica" IS 'Giro o actividad económica.';
COMMENT ON COLUMN "terceros"."clasificacion" IS 'Gran, mediano u otro contribuyente: decide la retención o percepción del 1 % de IVA.';
COMMENT ON COLUMN "terceros"."direccion" IS 'Dirección.';
COMMENT ON COLUMN "terceros"."telefono" IS 'Teléfono de contacto.';
COMMENT ON COLUMN "terceros"."correo" IS 'Correo electrónico de contacto.';
COMMENT ON COLUMN "terceros"."es_cliente" IS 'Verdadero si se le vende.';
COMMENT ON COLUMN "terceros"."es_proveedor" IS 'Verdadero si se le compra.';
COMMENT ON COLUMN "terceros"."dias_credito" IS 'Plazo de crédito en días por defecto para sus documentos al crédito; 0 si es de contado.';
COMMENT ON COLUMN "terceros"."activo" IS 'Un tercero inactivo no se ofrece en compras ni ventas, pero conserva su historial.';
COMMENT ON COLUMN "terceros"."creado_en" IS 'Fecha y hora de creación.';
COMMENT ON COLUMN "terceros"."actualizado_en" IS 'Fecha y hora de la última modificación.';

CREATE TRIGGER "terceros_actualizado_en" BEFORE UPDATE ON "terceros"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "terceros_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "terceros"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Como el resto de tablas, no es visible para la API de datos de Supabase
ALTER TABLE "terceros" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "terceros" FROM anon, authenticated;
  END IF;
END $$;
