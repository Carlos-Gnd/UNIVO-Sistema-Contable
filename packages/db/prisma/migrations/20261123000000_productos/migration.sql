-- Productos y categorías del inventario (HU-64, S3-T76).
-- El código del producto es único por empresa; la categoría debe ser de la misma empresa. Los cambios quedan en
-- la bitácora y el kardex (HU-65) se apoya en estos productos.

CREATE TABLE "categorias_producto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_producto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categorias_producto_id_empresa_id_key" ON "categorias_producto"("id", "empresa_id");
CREATE UNIQUE INDEX "categorias_producto_empresa_id_nombre_key" ON "categorias_producto"("empresa_id", "nombre");

CREATE TABLE "productos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "categoria_id" UUID,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "unidad_medida" VARCHAR(20) NOT NULL DEFAULT 'unidad',
    "precio_venta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "productos_precio_no_negativo" CHECK ("precio_venta" >= 0),
    CONSTRAINT "productos_codigo_formato" CHECK ("codigo" ~ '^[A-Za-z0-9._-]+$')
);

CREATE UNIQUE INDEX "productos_empresa_id_codigo_key" ON "productos"("empresa_id", "codigo");
CREATE INDEX "productos_empresa_id_categoria_id_idx" ON "productos"("empresa_id", "categoria_id");

ALTER TABLE "categorias_producto" ADD CONSTRAINT "categorias_producto_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "productos" ADD CONSTRAINT "productos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- La categoría debe ser de la misma empresa que el producto
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_empresa_id_fkey"
  FOREIGN KEY ("categoria_id", "empresa_id") REFERENCES "categorias_producto"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "categorias_producto" IS 'Categorías con las que se agrupan los productos de una empresa.';
COMMENT ON COLUMN "categorias_producto"."id" IS 'Identificador de la categoría.';
COMMENT ON COLUMN "categorias_producto"."empresa_id" IS 'Empresa dueña de la categoría.';
COMMENT ON COLUMN "categorias_producto"."nombre" IS 'Nombre de la categoría, único por empresa.';
COMMENT ON COLUMN "categorias_producto"."activa" IS 'Una categoría inactiva no se ofrece al crear productos.';
COMMENT ON COLUMN "categorias_producto"."creado_en" IS 'Fecha y hora de creación.';
COMMENT ON COLUMN "categorias_producto"."actualizado_en" IS 'Fecha y hora de la última modificación.';
COMMENT ON TABLE "productos" IS 'Productos que la empresa compra y vende; su movimiento se lleva en el kardex.';
COMMENT ON COLUMN "productos"."id" IS 'Identificador del producto.';
COMMENT ON COLUMN "productos"."empresa_id" IS 'Empresa dueña del producto.';
COMMENT ON COLUMN "productos"."categoria_id" IS 'Categoría del producto, de la misma empresa; opcional.';
COMMENT ON COLUMN "productos"."codigo" IS 'Código del producto: letras, dígitos y . _ -, único por empresa.';
COMMENT ON COLUMN "productos"."nombre" IS 'Nombre o descripción del producto.';
COMMENT ON COLUMN "productos"."unidad_medida" IS 'Unidad de medida (unidad, caja, libra...).';
COMMENT ON COLUMN "productos"."precio_venta" IS 'Precio de venta sin IVA en dólares.';
COMMENT ON COLUMN "productos"."activo" IS 'Un producto inactivo no se ofrece en compras ni ventas, pero conserva su historial.';
COMMENT ON COLUMN "productos"."creado_en" IS 'Fecha y hora de creación.';
COMMENT ON COLUMN "productos"."actualizado_en" IS 'Fecha y hora de la última modificación.';

CREATE TRIGGER "categorias_producto_actualizado_en" BEFORE UPDATE ON "categorias_producto"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "productos_actualizado_en" BEFORE UPDATE ON "productos"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "categorias_producto_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "categorias_producto"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "productos_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "productos"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Como el resto de tablas, no son visibles para la API de datos de Supabase
ALTER TABLE "categorias_producto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productos" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "categorias_producto", "productos" FROM anon, authenticated;
  END IF;
END $$;
