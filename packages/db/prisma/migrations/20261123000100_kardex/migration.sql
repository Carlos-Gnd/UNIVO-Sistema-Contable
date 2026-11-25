-- Kardex: movimientos de inventario por producto y sucursal (HU-65, S3-T79).
-- Las entradas y salidas no se modifican ni se borran: un error se corrige con un movimiento contrario. La base
-- exige el orden cronológico y que ninguna salida deje existencias negativas. El producto puede elegir su método
-- de valuación (si no, usa el de la empresa) hasta que tenga movimientos.

CREATE TYPE "tipo_movimiento_inventario" AS ENUM ('entrada', 'salida');

ALTER TABLE "productos"
  ADD COLUMN "metodo_valuacion" "metodo_valuacion",
  ADD COLUMN "existencia_minima" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "productos_existencia_minima_no_negativa" CHECK ("existencia_minima" >= 0);

COMMENT ON COLUMN "productos"."metodo_valuacion" IS 'Método de valuación propio del producto; si es nulo se usa el de la empresa. No se cambia cuando ya hay movimientos.';
COMMENT ON COLUMN "productos"."existencia_minima" IS 'Cantidad mínima en existencia antes de reabastecer; 0 si no se controla.';

CREATE TABLE "movimientos_inventario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "secuencia" BIGINT GENERATED ALWAYS AS IDENTITY,
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "tipo_movimiento_inventario" NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "costo_total" DECIMAL(14,2) NOT NULL,
    "referencia" VARCHAR(60),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimientos_inventario_cantidad_positiva" CHECK ("cantidad" > 0),
    CONSTRAINT "movimientos_inventario_costos_no_negativos" CHECK ("costo_unitario" >= 0 AND "costo_total" >= 0)
);

CREATE INDEX "movimientos_inventario_kardex_idx" ON "movimientos_inventario"("producto_id", "sucursal_id", "fecha", "secuencia");
CREATE INDEX "movimientos_inventario_empresa_id_idx" ON "movimientos_inventario"("empresa_id");

ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "movimientos_inventario" IS 'Entradas y salidas de los productos por sucursal: el kardex se arma con ellas. No se modifican ni se borran.';
COMMENT ON COLUMN "movimientos_inventario"."id" IS 'Identificador del movimiento.';
COMMENT ON COLUMN "movimientos_inventario"."secuencia" IS 'Orden de registro; desempata los movimientos de una misma fecha.';
COMMENT ON COLUMN "movimientos_inventario"."empresa_id" IS 'Empresa dueña del producto.';
COMMENT ON COLUMN "movimientos_inventario"."sucursal_id" IS 'Sucursal donde se guarda el producto.';
COMMENT ON COLUMN "movimientos_inventario"."producto_id" IS 'Producto que entra o sale.';
COMMENT ON COLUMN "movimientos_inventario"."fecha" IS 'Fecha del movimiento.';
COMMENT ON COLUMN "movimientos_inventario"."tipo" IS 'Entrada (compra, ajuste) o salida (venta, ajuste).';
COMMENT ON COLUMN "movimientos_inventario"."cantidad" IS 'Unidades que entran o salen; siempre positiva.';
COMMENT ON COLUMN "movimientos_inventario"."costo_unitario" IS 'Costo por unidad: el de la compra en una entrada; en una salida, el que resulta del método de valuación.';
COMMENT ON COLUMN "movimientos_inventario"."costo_total" IS 'Valor total del movimiento en dólares, al centavo.';
COMMENT ON COLUMN "movimientos_inventario"."referencia" IS 'Documento de origen (por ejemplo el CCF de la compra).';
COMMENT ON COLUMN "movimientos_inventario"."creado_en" IS 'Fecha y hora de registro.';

-- Valida cada movimiento: mismo dueño, orden cronológico y existencias suficientes. Bloquea el producto mientras
-- tanto para que dos registros simultáneos no se salten la regla.
CREATE FUNCTION interno.movimientos_inventario_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  existencias numeric;
BEGIN
  PERFORM 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = NEW.empresa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no pertenece a la empresa del movimiento' USING ERRCODE = 'foreign_key_violation';
  END IF;
  PERFORM 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa del movimiento' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM movimientos_inventario
             WHERE producto_id = NEW.producto_id AND sucursal_id = NEW.sucursal_id AND fecha > NEW.fecha) THEN
    RAISE EXCEPTION 'No se puede registrar un movimiento anterior al último del producto en la sucursal'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tipo = 'salida' THEN
    SELECT coalesce(sum(CASE tipo WHEN 'entrada' THEN cantidad ELSE -cantidad END), 0) INTO existencias
    FROM movimientos_inventario WHERE producto_id = NEW.producto_id AND sucursal_id = NEW.sucursal_id;
    IF NEW.cantidad > existencias THEN
      RAISE EXCEPTION 'Existencia insuficiente: hay % y se piden %', existencias, NEW.cantidad
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.movimientos_inventario_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos de inventario no se modifican ni se borran: corrige con un movimiento contrario';
END $$;

-- El método de valuación de un producto no cambia cuando ya tiene movimientos
CREATE FUNCTION interno.productos_metodo_bloqueado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.metodo_valuacion IS DISTINCT FROM OLD.metodo_valuacion
     AND EXISTS (SELECT 1 FROM movimientos_inventario WHERE producto_id = NEW.id) THEN
    RAISE EXCEPTION 'El método de valuación no se puede cambiar: el producto ya tiene movimientos'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "movimientos_inventario_validar_antes" BEFORE INSERT ON "movimientos_inventario"
  FOR EACH ROW EXECUTE FUNCTION interno.movimientos_inventario_validar();
CREATE TRIGGER "movimientos_inventario_sin_cambios" BEFORE UPDATE OR DELETE ON "movimientos_inventario"
  FOR EACH ROW EXECUTE FUNCTION interno.movimientos_inventario_inmutables();
CREATE TRIGGER "movimientos_inventario_sin_vaciar" BEFORE TRUNCATE ON "movimientos_inventario"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.movimientos_inventario_inmutables();
CREATE TRIGGER "productos_metodo_bloqueado" BEFORE UPDATE OF "metodo_valuacion" ON "productos"
  FOR EACH ROW EXECUTE FUNCTION interno.productos_metodo_bloqueado();
CREATE TRIGGER "movimientos_inventario_bitacora" AFTER INSERT ON "movimientos_inventario"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.movimientos_inventario_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.movimientos_inventario_inmutables() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.productos_metodo_bloqueado() FROM PUBLIC;

COMMENT ON FUNCTION interno.movimientos_inventario_validar() IS 'Trigger de movimientos_inventario: producto y sucursal de la empresa, orden cronológico y existencias suficientes.';
COMMENT ON FUNCTION interno.movimientos_inventario_inmutables() IS 'Trigger de movimientos_inventario: no se modifican ni se borran.';
COMMENT ON FUNCTION interno.productos_metodo_bloqueado() IS 'Trigger de productos: el método de valuación no cambia si el producto tiene movimientos.';

-- Como el resto de tablas, no es visible para la API de datos de Supabase
ALTER TABLE "movimientos_inventario" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "movimientos_inventario" FROM anon, authenticated;
  END IF;
END $$;
