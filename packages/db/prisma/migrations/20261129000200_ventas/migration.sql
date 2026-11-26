-- Registro de ventas (HU-60, S3-T64): partida del costo de ventas y resumen de facturas de consumidor final.
-- Una venta genera dos partidas en borrador: la de la venta (cobro o cuenta por cobrar, ventas e IVA débito fiscal)
-- y la del costo de ventas contra inventarios (solo con inventario perpetuo). Las facturas de consumidor final se
-- registran en resumen: un renglón del libro cubre del primer al último número del día o de la caja.

ALTER TABLE "documentos_comerciales"
  ADD COLUMN "partida_costo_id" UUID,
  ADD COLUMN "numero_documento_hasta" VARCHAR(60),
  ADD CONSTRAINT "documentos_comerciales_costo_solo_venta" CHECK ("partida_costo_id" IS NULL OR "operacion" = 'venta'),
  ADD CONSTRAINT "documentos_comerciales_rango_solo_factura_venta" CHECK (
    "numero_documento_hasta" IS NULL OR ("operacion" = 'venta' AND "tipo_documento" = 'factura')
  );

CREATE UNIQUE INDEX "documentos_comerciales_partida_costo_id_key" ON "documentos_comerciales"("partida_costo_id");

ALTER TABLE "documentos_comerciales" ADD CONSTRAINT "documentos_comerciales_partida_costo_id_fkey"
  FOREIGN KEY ("partida_costo_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON COLUMN "documentos_comerciales"."partida_costo_id" IS 'Partida en borrador del costo de ventas (debe costo de ventas, haber inventarios) generada con la salida del kardex; nula en compras y con inventario analítico.';
COMMENT ON COLUMN "documentos_comerciales"."numero_documento_hasta" IS 'Último número de un resumen de facturas de consumidor final: el libro lo muestra como «del número_documento al numero_documento_hasta»; nulo en cualquier otro documento.';

-- La partida del costo también debe ser de la empresa del documento
CREATE OR REPLACE FUNCTION interno.documentos_comerciales_validar() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW.partida_costo_id IS NOT NULL THEN
    SELECT empresa_id INTO partida_empresa FROM partidas WHERE id = NEW.partida_costo_id;
    IF partida_empresa IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'La partida del costo no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
