-- Documentos de compra y venta (HU-59, S3-T61; las ventas se completan en HU-60).
-- Una tabla para ambas operaciones: el documento (CCF, factura o exportación) con sus totales de IVA, su condición de
-- pago y la partida que lo contabiliza, más sus líneas con el movimiento del kardex. Los libros de IVA (compras,
-- contribuyentes y consumidor final) y las cuentas por pagar y cobrar leen de aquí; solo cuentan los documentos cuya
-- partida está contabilizada o anulada, nunca los de partidas en borrador. Los cambios quedan en la bitácora.

CREATE TYPE "operacion_comercial" AS ENUM ('compra', 'venta');
CREATE TYPE "tipo_documento_comercial" AS ENUM ('ccf', 'factura', 'exportacion');
CREATE TYPE "condicion_pago" AS ENUM ('contado', 'credito');
CREATE TYPE "clase_gravamen" AS ENUM ('gravada', 'exenta', 'no_sujeta');

CREATE TABLE "documentos_comerciales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "operacion" "operacion_comercial" NOT NULL,
    "tipo_documento" "tipo_documento_comercial" NOT NULL,
    "numero_documento" VARCHAR(60) NOT NULL,
    "fecha" DATE NOT NULL,
    "tercero_id" UUID,
    "condicion_pago" "condicion_pago" NOT NULL,
    "cuenta_pago_id" UUID,
    "dias_credito" SMALLINT NOT NULL DEFAULT 0,
    "fecha_vencimiento" DATE,
    "total_gravado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_exento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_no_sujeto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva_percibido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva_retenido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "total_neto" DECIMAL(14,2) NOT NULL,
    "partida_id" UUID NOT NULL,
    "observaciones" VARCHAR(300),
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_comerciales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documentos_comerciales_montos_no_negativos" CHECK (
      "total_gravado" >= 0 AND "total_exento" >= 0 AND "total_no_sujeto" >= 0 AND "iva" >= 0
      AND "iva_percibido" >= 0 AND "iva_retenido" >= 0 AND "total" > 0
    ),
    CONSTRAINT "documentos_comerciales_total_cuadra" CHECK (
      "total" = "total_gravado" + "total_exento" + "total_no_sujeto" + "iva" + "iva_percibido"
      AND "total_neto" = "total" - "iva_retenido"
    ),
    CONSTRAINT "documentos_comerciales_pago" CHECK (
      ("condicion_pago" = 'contado' AND "cuenta_pago_id" IS NOT NULL AND "fecha_vencimiento" IS NULL)
      OR ("condicion_pago" = 'credito' AND "cuenta_pago_id" IS NULL AND "fecha_vencimiento" IS NOT NULL
          AND "fecha_vencimiento" >= "fecha")
    ),
    CONSTRAINT "documentos_comerciales_compra_con_proveedor" CHECK ("operacion" = 'venta' OR "tercero_id" IS NOT NULL),
    CONSTRAINT "documentos_comerciales_exportacion_solo_venta" CHECK ("tipo_documento" <> 'exportacion' OR "operacion" = 'venta'),
    CONSTRAINT "documentos_comerciales_ccf_con_tercero" CHECK ("tipo_documento" <> 'ccf' OR "tercero_id" IS NOT NULL),
    CONSTRAINT "documentos_comerciales_dias_credito_rango" CHECK ("dias_credito" BETWEEN 0 AND 365)
);

CREATE UNIQUE INDEX "documentos_comerciales_id_empresa_id_key" ON "documentos_comerciales"("id", "empresa_id");
CREATE UNIQUE INDEX "documentos_comerciales_partida_id_key" ON "documentos_comerciales"("partida_id");
-- Un documento de compra no se registra dos veces del mismo proveedor; uno de venta, dos veces con el mismo número
CREATE UNIQUE INDEX "documentos_comerciales_compra_unica" ON "documentos_comerciales"("empresa_id", "tipo_documento", "tercero_id", "numero_documento")
  WHERE "operacion" = 'compra';
CREATE UNIQUE INDEX "documentos_comerciales_venta_unica" ON "documentos_comerciales"("empresa_id", "tipo_documento", "numero_documento")
  WHERE "operacion" = 'venta';
CREATE INDEX "documentos_comerciales_libro_idx" ON "documentos_comerciales"("empresa_id", "operacion", "fecha");
CREATE INDEX "documentos_comerciales_tercero_idx" ON "documentos_comerciales"("tercero_id");
CREATE INDEX "documentos_comerciales_sucursal_idx" ON "documentos_comerciales"("sucursal_id");

ALTER TABLE "documentos_comerciales" ADD CONSTRAINT "documentos_comerciales_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales" ADD CONSTRAINT "documentos_comerciales_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales" ADD CONSTRAINT "documentos_comerciales_tercero_id_empresa_id_fkey"
  FOREIGN KEY ("tercero_id", "empresa_id") REFERENCES "terceros"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales" ADD CONSTRAINT "documentos_comerciales_cuenta_pago_id_fkey"
  FOREIGN KEY ("cuenta_pago_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales" ADD CONSTRAINT "documentos_comerciales_partida_id_fkey"
  FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "documentos_comerciales" IS 'Documentos de compra y venta (CCF, factura de consumidor final o exportación) con su IVA, su condición de pago y la partida que los contabiliza. Fuente de los libros de IVA y de las cuentas por pagar y cobrar.';
COMMENT ON COLUMN "documentos_comerciales"."id" IS 'Identificador del documento.';
COMMENT ON COLUMN "documentos_comerciales"."empresa_id" IS 'Empresa que registra el documento.';
COMMENT ON COLUMN "documentos_comerciales"."sucursal_id" IS 'Sucursal que registra el documento y donde entra o sale el inventario.';
COMMENT ON COLUMN "documentos_comerciales"."operacion" IS 'Compra (documento del proveedor) o venta (documento a un cliente).';
COMMENT ON COLUMN "documentos_comerciales"."tipo_documento" IS 'CCF (crédito fiscal), factura de consumidor final o exportación (solo ventas).';
COMMENT ON COLUMN "documentos_comerciales"."numero_documento" IS 'Número del documento: el del proveedor en una compra, el propio en una venta.';
COMMENT ON COLUMN "documentos_comerciales"."fecha" IS 'Fecha del documento.';
COMMENT ON COLUMN "documentos_comerciales"."tercero_id" IS 'Proveedor o cliente; nulo en una venta a consumidor final sin identificar.';
COMMENT ON COLUMN "documentos_comerciales"."condicion_pago" IS 'Contado (sale o entra efectivo de inmediato) o crédito (queda en cuentas por pagar o por cobrar).';
COMMENT ON COLUMN "documentos_comerciales"."cuenta_pago_id" IS 'Cuenta contable de efectivo (caja o banco) del pago o cobro al contado; nulo si es al crédito.';
COMMENT ON COLUMN "documentos_comerciales"."dias_credito" IS 'Plazo en días de un documento al crédito.';
COMMENT ON COLUMN "documentos_comerciales"."fecha_vencimiento" IS 'Fecha en que vence un documento al crédito; nula si es de contado.';
COMMENT ON COLUMN "documentos_comerciales"."total_gravado" IS 'Base gravada con IVA, sin el IVA.';
COMMENT ON COLUMN "documentos_comerciales"."total_exento" IS 'Total de operaciones exentas (incluye las exportaciones).';
COMMENT ON COLUMN "documentos_comerciales"."total_no_sujeto" IS 'Total de operaciones no sujetas.';
COMMENT ON COLUMN "documentos_comerciales"."iva" IS 'IVA del documento: crédito fiscal en una compra con CCF, débito fiscal en una venta.';
COMMENT ON COLUMN "documentos_comerciales"."iva_percibido" IS 'IVA percibido (1 %) que se suma al documento: lo cobra el proveedor gran contribuyente en una compra o la empresa gran contribuyente en una venta.';
COMMENT ON COLUMN "documentos_comerciales"."iva_retenido" IS 'IVA retenido (1 %) que no se paga o no se cobra: lo retiene la empresa gran contribuyente en una compra, o el cliente gran contribuyente en una venta.';
COMMENT ON COLUMN "documentos_comerciales"."total" IS 'Total del documento: gravado + exento + no sujeto + IVA + IVA percibido.';
COMMENT ON COLUMN "documentos_comerciales"."total_neto" IS 'Lo que se paga o se cobra en realidad: total menos IVA retenido. Es el saldo inicial por pagar o por cobrar si es al crédito.';
COMMENT ON COLUMN "documentos_comerciales"."partida_id" IS 'Partida que contabiliza el documento; nace en borrador para que el contador la revise.';
COMMENT ON COLUMN "documentos_comerciales"."observaciones" IS 'Notas del documento.';
COMMENT ON COLUMN "documentos_comerciales"."creado_por" IS 'Usuario que registró el documento.';
COMMENT ON COLUMN "documentos_comerciales"."creado_en" IS 'Fecha y hora de registro.';

CREATE TABLE "documentos_comerciales_lineas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "producto_id" UUID,
    "cuenta_id" UUID,
    "descripcion" VARCHAR(200) NOT NULL,
    "clase_gravamen" "clase_gravamen" NOT NULL DEFAULT 'gravada',
    "cantidad" DECIMAL(14,4) NOT NULL,
    "precio_unitario" DECIMAL(14,4) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "movimiento_inventario_id" UUID,

    CONSTRAINT "documentos_comerciales_lineas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documentos_comerciales_lineas_producto_o_cuenta" CHECK ("producto_id" IS NOT NULL OR "cuenta_id" IS NOT NULL),
    CONSTRAINT "documentos_comerciales_lineas_valores" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0 AND "monto" >= 0),
    CONSTRAINT "documentos_comerciales_lineas_movimiento_con_producto" CHECK ("movimiento_inventario_id" IS NULL OR "producto_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "documentos_comerciales_lineas_documento_id_orden_key" ON "documentos_comerciales_lineas"("documento_id", "orden");
CREATE UNIQUE INDEX "documentos_comerciales_lineas_movimiento_key" ON "documentos_comerciales_lineas"("movimiento_inventario_id");
CREATE INDEX "documentos_comerciales_lineas_producto_idx" ON "documentos_comerciales_lineas"("producto_id");
CREATE INDEX "documentos_comerciales_lineas_empresa_idx" ON "documentos_comerciales_lineas"("empresa_id");

ALTER TABLE "documentos_comerciales_lineas" ADD CONSTRAINT "documentos_comerciales_lineas_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales_lineas" ADD CONSTRAINT "documentos_comerciales_lineas_documento_id_empresa_id_fkey"
  FOREIGN KEY ("documento_id", "empresa_id") REFERENCES "documentos_comerciales"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales_lineas" ADD CONSTRAINT "documentos_comerciales_lineas_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales_lineas" ADD CONSTRAINT "documentos_comerciales_lineas_cuenta_id_fkey"
  FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentos_comerciales_lineas" ADD CONSTRAINT "documentos_comerciales_lineas_movimiento_inventario_id_fkey"
  FOREIGN KEY ("movimiento_inventario_id") REFERENCES "movimientos_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "documentos_comerciales_lineas" IS 'Líneas de un documento de compra o venta: un producto (con su movimiento del kardex) o una cuenta contable de gasto, activo o ingreso.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."id" IS 'Identificador de la línea.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."empresa_id" IS 'Empresa dueña del documento.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."documento_id" IS 'Documento al que pertenece.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."orden" IS 'Posición de la línea dentro del documento.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."producto_id" IS 'Producto del inventario que entra o sale; nulo en una línea de gasto, activo o servicio.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."cuenta_id" IS 'Cuenta contable de gasto, activo o ingreso de una línea sin producto; nula en las líneas de producto, que usan las cuentas de inventario, compras o ventas.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."descripcion" IS 'Descripción de la línea como figura en el documento.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."clase_gravamen" IS 'Gravada, exenta o no sujeta: decide la columna del libro de IVA.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."cantidad" IS 'Unidades de la línea.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."precio_unitario" IS 'Precio por unidad como figura en el documento: sin IVA en un CCF; con IVA en una factura de consumidor final de una venta.';
COMMENT ON COLUMN "documentos_comerciales_lineas"."monto" IS 'Importe de la línea (cantidad por precio unitario, al centavo).';
COMMENT ON COLUMN "documentos_comerciales_lineas"."movimiento_inventario_id" IS 'Entrada o salida del kardex que generó la línea; nulo si no mueve inventario.';

-- Coherencia entre el documento y lo que referencia: mismo dueño, proveedor o cliente según la operación,
-- cuenta de pago de efectivo y partida de la empresa
CREATE FUNCTION interno.documentos_comerciales_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
  codigo_pago text;
  partida_empresa uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'observaciones') IS DISTINCT FROM (to_jsonb(OLD) - 'observaciones') THEN
      RAISE EXCEPTION 'Un documento registrado solo admite cambiar sus observaciones'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.tercero_id IS NOT NULL THEN
    SELECT es_cliente, es_proveedor INTO t FROM terceros WHERE id = NEW.tercero_id AND empresa_id = NEW.empresa_id;
    IF NEW.operacion = 'compra' AND NOT coalesce(t.es_proveedor, false) THEN
      RAISE EXCEPTION 'El tercero de una compra debe ser un proveedor' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.operacion = 'venta' AND NOT coalesce(t.es_cliente, false) THEN
      RAISE EXCEPTION 'El tercero de una venta debe ser un cliente' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.cuenta_pago_id IS NOT NULL THEN
    SELECT codigo INTO codigo_pago FROM cuentas WHERE id = NEW.cuenta_pago_id AND empresa_id = NEW.empresa_id;
    IF codigo_pago IS NULL OR codigo_pago NOT LIKE '1101%' THEN
      RAISE EXCEPTION 'La cuenta de pago debe ser una cuenta de efectivo (1101…) de la empresa' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  SELECT empresa_id INTO partida_empresa FROM partidas WHERE id = NEW.partida_id;
  IF partida_empresa IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

-- Una línea con producto usa un producto de la empresa y con cuenta, una cuenta de la empresa
CREATE FUNCTION interno.documentos_comerciales_lineas_validar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Las líneas de un documento registrado no se modifican ni se borran' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.producto_id IS NOT NULL THEN
    PERFORM 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = NEW.empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  IF NEW.cuenta_id IS NOT NULL THEN
    PERFORM 1 FROM cuentas WHERE id = NEW.cuenta_id AND empresa_id = NEW.empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La cuenta no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.documentos_comerciales_sin_borrar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los documentos de compra y venta no se borran: se corrigen con notas de crédito o débito' USING ERRCODE = 'check_violation';
END $$;

REVOKE ALL ON FUNCTION interno.documentos_comerciales_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.documentos_comerciales_lineas_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.documentos_comerciales_sin_borrar() FROM PUBLIC;

COMMENT ON FUNCTION interno.documentos_comerciales_validar() IS 'Trigger de documentos_comerciales: sucursal, proveedor o cliente, cuenta de efectivo y partida de la empresa; después de registrado solo se editan las observaciones.';
COMMENT ON FUNCTION interno.documentos_comerciales_lineas_validar() IS 'Trigger de documentos_comerciales_lineas: producto y cuenta de la empresa; las líneas no se modifican.';
COMMENT ON FUNCTION interno.documentos_comerciales_sin_borrar() IS 'Trigger de documentos_comerciales y sus líneas: no se borran.';

CREATE TRIGGER "documentos_comerciales_validar_antes" BEFORE INSERT OR UPDATE ON "documentos_comerciales"
  FOR EACH ROW EXECUTE FUNCTION interno.documentos_comerciales_validar();
CREATE TRIGGER "documentos_comerciales_sin_borrar" BEFORE DELETE ON "documentos_comerciales"
  FOR EACH ROW EXECUTE FUNCTION interno.documentos_comerciales_sin_borrar();
CREATE TRIGGER "documentos_comerciales_lineas_validar_antes" BEFORE INSERT OR UPDATE ON "documentos_comerciales_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.documentos_comerciales_lineas_validar();
CREATE TRIGGER "documentos_comerciales_lineas_sin_borrar" BEFORE DELETE ON "documentos_comerciales_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.documentos_comerciales_sin_borrar();
CREATE TRIGGER "documentos_comerciales_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "documentos_comerciales"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "documentos_comerciales_lineas_bitacora" AFTER INSERT ON "documentos_comerciales_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Como el resto de tablas, no son visibles para la API de datos de Supabase
ALTER TABLE "documentos_comerciales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documentos_comerciales_lineas" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "documentos_comerciales", "documentos_comerciales_lineas" FROM anon, authenticated;
  END IF;
END $$;
