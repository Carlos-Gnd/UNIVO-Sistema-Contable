-- HU-66, S3-T82: series e IMEI vinculados a movimientos de inventario, con costo específico por unidad.

ALTER TABLE "productos"
  ADD COLUMN "controla_series" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "productos"."controla_series" IS 'Indica si cada unidad del producto se identifica por serie o IMEI.';

CREATE TABLE "series_inventario" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "empresa_id" UUID NOT NULL,
  "sucursal_id" UUID NOT NULL,
  "producto_id" UUID NOT NULL,
  "numero_serie" VARCHAR(100) NOT NULL,
  "costo_unitario" DECIMAL(14,2) NOT NULL,
  "movimiento_entrada_id" UUID NOT NULL,
  "movimiento_salida_id" UUID,
  "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "series_inventario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "series_inventario_numero_no_vacio" CHECK (btrim("numero_serie") <> ''),
  CONSTRAINT "series_inventario_empresa_serie_unq" UNIQUE ("empresa_id", "numero_serie"),
  CONSTRAINT "series_inventario_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "series_inventario_sucursal_id_fkey"
    FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "series_inventario_producto_id_fkey"
    FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "series_inventario_movimiento_entrada_id_fkey"
    FOREIGN KEY ("movimiento_entrada_id") REFERENCES "movimientos_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "series_inventario_movimiento_salida_id_fkey"
    FOREIGN KEY ("movimiento_salida_id") REFERENCES "movimientos_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "series_inventario_existencia_idx"
  ON "series_inventario"("producto_id", "sucursal_id", "movimiento_salida_id");

COMMENT ON TABLE "series_inventario" IS 'Unidades seriadas de inventario. La entrada y salida apuntan a movimientos, sin depender del documento de origen.';
COMMENT ON COLUMN "series_inventario"."id" IS 'Identificador de la unidad seriada.';
COMMENT ON COLUMN "series_inventario"."empresa_id" IS 'Empresa propietaria de la serie.';
COMMENT ON COLUMN "series_inventario"."sucursal_id" IS 'Sucursal donde ingresó la unidad.';
COMMENT ON COLUMN "series_inventario"."producto_id" IS 'Producto al que pertenece la serie.';
COMMENT ON COLUMN "series_inventario"."numero_serie" IS 'Número de serie o IMEI, normalizado a mayúsculas.';
COMMENT ON COLUMN "series_inventario"."costo_unitario" IS 'Valor contable de esta unidad, asignado al centavo dentro de su movimiento de entrada.';
COMMENT ON COLUMN "series_inventario"."movimiento_entrada_id" IS 'Movimiento de inventario que incorporó la unidad y fija su costo.';
COMMENT ON COLUMN "series_inventario"."movimiento_salida_id" IS 'Movimiento de salida que consumió la unidad; nulo mientras está en existencia.';
COMMENT ON COLUMN "series_inventario"."creado_en" IS 'Fecha y hora en que se registró la serie.';

CREATE FUNCTION interno.series_inventario_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  controla boolean;
  empresa_mov uuid;
  sucursal_mov uuid;
  producto_mov uuid;
  tipo_mov tipo_movimiento_inventario;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las series de inventario no se borran; registra el movimiento correctivo correspondiente'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.numero_serie := upper(btrim(NEW.numero_serie));
    IF NEW.numero_serie = '' THEN
      RAISE EXCEPTION 'El número de serie no puede estar vacío' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.movimiento_salida_id IS NOT NULL THEN
      RAISE EXCEPTION 'Una serie nueva todavía no tiene movimiento de salida' USING ERRCODE = 'check_violation';
    END IF;

    SELECT p.controla_series INTO controla
    FROM productos p WHERE p.id = NEW.producto_id AND p.empresa_id = NEW.empresa_id
    FOR UPDATE;
    IF NOT FOUND OR NOT controla THEN
      RAISE EXCEPTION 'El producto no controla series en esta empresa' USING ERRCODE = 'check_violation';
    END IF;

    SELECT m.empresa_id, m.sucursal_id, m.producto_id, m.tipo
      INTO empresa_mov, sucursal_mov, producto_mov, tipo_mov
    FROM movimientos_inventario m WHERE m.id = NEW.movimiento_entrada_id;
    IF NOT FOUND OR empresa_mov <> NEW.empresa_id OR sucursal_mov <> NEW.sucursal_id
       OR producto_mov <> NEW.producto_id OR tipo_mov <> 'entrada' THEN
      RAISE EXCEPTION 'La serie debe pertenecer a un movimiento de entrada del mismo producto, empresa y sucursal'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     OR NEW.producto_id IS DISTINCT FROM OLD.producto_id
     OR NEW.numero_serie IS DISTINCT FROM OLD.numero_serie
     OR NEW.costo_unitario IS DISTINCT FROM OLD.costo_unitario
     OR NEW.movimiento_entrada_id IS DISTINCT FROM OLD.movimiento_entrada_id
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
     OR OLD.movimiento_salida_id IS NOT NULL
     OR NEW.movimiento_salida_id IS NULL THEN
    RAISE EXCEPTION 'La serie es inmutable; solo se permite registrar una salida una vez'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.controla_series INTO controla
  FROM productos p WHERE p.id = NEW.producto_id AND p.empresa_id = NEW.empresa_id
  FOR UPDATE;
  IF NOT FOUND OR NOT controla THEN
    RAISE EXCEPTION 'El producto no controla series en esta empresa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT m.empresa_id, m.sucursal_id, m.producto_id, m.tipo
    INTO empresa_mov, sucursal_mov, producto_mov, tipo_mov
  FROM movimientos_inventario m WHERE m.id = NEW.movimiento_salida_id;
  IF NOT FOUND OR empresa_mov <> NEW.empresa_id OR sucursal_mov <> NEW.sucursal_id
     OR producto_mov <> NEW.producto_id OR tipo_mov <> 'salida' THEN
    RAISE EXCEPTION 'La serie debe salir en un movimiento del mismo producto, empresa y sucursal'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.series_inventario_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las series de inventario no se truncan';
END $$;

CREATE FUNCTION interno.movimientos_series_completos() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  controla boolean;
  vinculadas bigint;
  costo_series numeric;
BEGIN
  SELECT p.controla_series INTO controla FROM productos p WHERE p.id = NEW.producto_id;
  IF NOT coalesce(controla, FALSE) THEN
    RETURN NULL;
  END IF;

  IF NEW.cantidad <> trunc(NEW.cantidad) THEN
    RAISE EXCEPTION 'La cantidad de un producto controlado por serie debe ser entera'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.tipo = 'entrada' THEN
    SELECT count(*), round(coalesce(sum(s.costo_unitario), 0), 2)
      INTO vinculadas, costo_series
    FROM series_inventario s WHERE s.movimiento_entrada_id = NEW.id;
    IF vinculadas <> NEW.cantidad THEN
      RAISE EXCEPTION 'Debe registrarse una serie por cada unidad de la entrada'
        USING ERRCODE = 'check_violation';
    END IF;
    IF costo_series <> NEW.costo_total THEN
      RAISE EXCEPTION 'El costo de entrada debe coincidir con el costo asignado a sus series'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT count(*), round(coalesce(sum(s.costo_unitario), 0), 2)
      INTO vinculadas, costo_series
    FROM series_inventario s
    WHERE s.movimiento_salida_id = NEW.id;
    IF vinculadas <> NEW.cantidad THEN
      RAISE EXCEPTION 'Debe elegirse una serie en existencia por cada unidad de la salida'
        USING ERRCODE = 'check_violation';
    END IF;
    IF costo_series <> NEW.costo_total THEN
      RAISE EXCEPTION 'El costo de la salida debe coincidir con el costo de las series elegidas'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION interno.productos_control_series_bloqueado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.controla_series IS DISTINCT FROM OLD.controla_series
     AND EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.producto_id = NEW.id) THEN
    RAISE EXCEPTION 'El control por serie no se puede cambiar: el producto ya tiene movimientos'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "series_inventario_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "series_inventario"
  FOR EACH ROW EXECUTE FUNCTION interno.series_inventario_validar();
CREATE TRIGGER "series_inventario_sin_truncar"
  BEFORE TRUNCATE ON "series_inventario"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.series_inventario_inmutables();
CREATE TRIGGER "series_inventario_bitacora"
  AFTER INSERT OR UPDATE ON "series_inventario"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE CONSTRAINT TRIGGER "movimientos_inventario_series_completas"
  AFTER INSERT ON "movimientos_inventario" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION interno.movimientos_series_completos();
CREATE TRIGGER "productos_control_series_bloqueado"
  BEFORE UPDATE OF "controla_series" ON "productos"
  FOR EACH ROW EXECUTE FUNCTION interno.productos_control_series_bloqueado();

REVOKE ALL ON FUNCTION interno.series_inventario_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.series_inventario_inmutables() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.movimientos_series_completos() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.productos_control_series_bloqueado() FROM PUBLIC;

COMMENT ON FUNCTION interno.series_inventario_validar() IS 'Valida la empresa, producto, sucursal y movimientos de entrada y salida de una serie.';
COMMENT ON FUNCTION interno.series_inventario_inmutables() IS 'Impide truncar el historial de series de inventario.';
COMMENT ON FUNCTION interno.movimientos_series_completos() IS 'Exige una serie por unidad y valida que la salida use el costo de las series elegidas.';
COMMENT ON FUNCTION interno.productos_control_series_bloqueado() IS 'Impide cambiar el control por serie después del primer movimiento del producto.';

ALTER TABLE "series_inventario" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "series_inventario" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "series_inventario" FROM authenticated;
  END IF;
END $$;
