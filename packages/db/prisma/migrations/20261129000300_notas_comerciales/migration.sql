-- Devoluciones y rebajas (HU-61, S3-T67): notas de crédito y de débito sobre documentos de compra y venta.
-- Una nota de crédito (devolución de mercadería o rebaja) baja el IVA, el kardex y el saldo por cobrar o por pagar del
-- documento; una nota de débito (cargo adicional) los sube. Cada nota lleva su partida en borrador y, en una devolución
-- de venta con inventario perpetuo, la partida que regresa el costo a inventarios. La base impide devolver más de lo
-- vendido o comprado y rebajar más que el saldo del documento.

CREATE TYPE "tipo_nota_comercial" AS ENUM ('credito', 'debito');
CREATE TYPE "motivo_nota_comercial" AS ENUM ('devolucion', 'rebaja', 'cargo');

CREATE TABLE "notas_comerciales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "operacion" "operacion_comercial" NOT NULL,
    "tipo" "tipo_nota_comercial" NOT NULL,
    "motivo" "motivo_nota_comercial" NOT NULL,
    "numero_nota" VARCHAR(60) NOT NULL,
    "fecha" DATE NOT NULL,
    "tercero_id" UUID,
    "cuenta_pago_id" UUID,
    "total_gravado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_exento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_no_sujeto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva_percibido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva_retenido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "total_neto" DECIMAL(14,2) NOT NULL,
    "partida_id" UUID NOT NULL,
    "partida_costo_id" UUID,
    "observaciones" VARCHAR(300),
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notas_comerciales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notas_comerciales_montos_no_negativos" CHECK (
      "total_gravado" >= 0 AND "total_exento" >= 0 AND "total_no_sujeto" >= 0 AND "iva" >= 0
      AND "iva_percibido" >= 0 AND "iva_retenido" >= 0 AND "total" > 0
    ),
    CONSTRAINT "notas_comerciales_total_cuadra" CHECK (
      "total" = "total_gravado" + "total_exento" + "total_no_sujeto" + "iva" + "iva_percibido"
      AND "total_neto" = "total" - "iva_retenido"
    ),
    CONSTRAINT "notas_comerciales_tipo_motivo" CHECK (
      ("tipo" = 'credito' AND "motivo" IN ('devolucion', 'rebaja')) OR ("tipo" = 'debito' AND "motivo" = 'cargo')
    ),
    CONSTRAINT "notas_comerciales_costo_solo_devolucion_venta" CHECK (
      "partida_costo_id" IS NULL OR ("operacion" = 'venta' AND "motivo" = 'devolucion')
    )
);

CREATE UNIQUE INDEX "notas_comerciales_id_empresa_id_key" ON "notas_comerciales"("id", "empresa_id");
CREATE UNIQUE INDEX "notas_comerciales_partida_id_key" ON "notas_comerciales"("partida_id");
CREATE UNIQUE INDEX "notas_comerciales_partida_costo_id_key" ON "notas_comerciales"("partida_costo_id");
-- Una nota del proveedor no se registra dos veces; una propia, dos veces con el mismo número
CREATE UNIQUE INDEX "notas_comerciales_compra_unica" ON "notas_comerciales"("empresa_id", "tipo", "tercero_id", "numero_nota")
  WHERE "operacion" = 'compra';
CREATE UNIQUE INDEX "notas_comerciales_venta_unica" ON "notas_comerciales"("empresa_id", "tipo", "numero_nota")
  WHERE "operacion" = 'venta';
CREATE INDEX "notas_comerciales_libro_idx" ON "notas_comerciales"("empresa_id", "operacion", "fecha");
CREATE INDEX "notas_comerciales_documento_idx" ON "notas_comerciales"("documento_id");
CREATE INDEX "notas_comerciales_sucursal_idx" ON "notas_comerciales"("sucursal_id");

ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_documento_id_empresa_id_fkey"
  FOREIGN KEY ("documento_id", "empresa_id") REFERENCES "documentos_comerciales"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_tercero_id_empresa_id_fkey"
  FOREIGN KEY ("tercero_id", "empresa_id") REFERENCES "terceros"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_cuenta_pago_id_fkey"
  FOREIGN KEY ("cuenta_pago_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_partida_id_fkey"
  FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales" ADD CONSTRAINT "notas_comerciales_partida_costo_id_fkey"
  FOREIGN KEY ("partida_costo_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "notas_comerciales" IS 'Notas de crédito (devolución o rebaja) y de débito (cargo adicional) sobre un documento de compra o venta, con su IVA y la partida que las contabiliza. Los libros de IVA y las cuentas por cobrar y por pagar las leen junto a los documentos.';
COMMENT ON COLUMN "notas_comerciales"."id" IS 'Identificador de la nota.';
COMMENT ON COLUMN "notas_comerciales"."empresa_id" IS 'Empresa que registra la nota.';
COMMENT ON COLUMN "notas_comerciales"."sucursal_id" IS 'Sucursal que registra la nota y donde regresa o sale el inventario.';
COMMENT ON COLUMN "notas_comerciales"."documento_id" IS 'Documento de compra o venta que corrige.';
COMMENT ON COLUMN "notas_comerciales"."operacion" IS 'Compra (nota del proveedor) o venta (nota a un cliente); la misma del documento corregido.';
COMMENT ON COLUMN "notas_comerciales"."tipo" IS 'Crédito (baja lo que se debe o se cobra) o débito (lo sube).';
COMMENT ON COLUMN "notas_comerciales"."motivo" IS 'Devolución de mercadería (mueve el kardex), rebaja de precio o cargo adicional (nota de débito).';
COMMENT ON COLUMN "notas_comerciales"."numero_nota" IS 'Número de la nota: el del proveedor en una compra, el propio en una venta.';
COMMENT ON COLUMN "notas_comerciales"."fecha" IS 'Fecha de la nota; no es anterior a la del documento.';
COMMENT ON COLUMN "notas_comerciales"."tercero_id" IS 'Proveedor o cliente del documento corregido; nulo en una venta a consumidor final.';
COMMENT ON COLUMN "notas_comerciales"."cuenta_pago_id" IS 'Cuenta de efectivo (caja o banco) del reembolso o cobro de una nota sobre un documento al contado; nula si el documento es al crédito.';
COMMENT ON COLUMN "notas_comerciales"."total_gravado" IS 'Base gravada con IVA de la nota, sin el IVA.';
COMMENT ON COLUMN "notas_comerciales"."total_exento" IS 'Total exento de la nota.';
COMMENT ON COLUMN "notas_comerciales"."total_no_sujeto" IS 'Total no sujeto de la nota.';
COMMENT ON COLUMN "notas_comerciales"."iva" IS 'IVA de la nota: el que se revierte (crédito) o se agrega (débito) en el crédito o débito fiscal.';
COMMENT ON COLUMN "notas_comerciales"."iva_percibido" IS 'IVA percibido (1 %) que acompaña a la nota si el documento lo tenía.';
COMMENT ON COLUMN "notas_comerciales"."iva_retenido" IS 'IVA retenido (1 %) que acompaña a la nota si el documento lo tenía.';
COMMENT ON COLUMN "notas_comerciales"."total" IS 'Total de la nota: gravado + exento + no sujeto + IVA + IVA percibido.';
COMMENT ON COLUMN "notas_comerciales"."total_neto" IS 'Lo que la nota baja o sube del saldo por cobrar o por pagar: total menos IVA retenido.';
COMMENT ON COLUMN "notas_comerciales"."partida_id" IS 'Partida que contabiliza la nota; nace en borrador para que el contador la revise.';
COMMENT ON COLUMN "notas_comerciales"."partida_costo_id" IS 'Partida en borrador que regresa el costo de la mercadería devuelta de inventarios a costo de ventas; solo en una devolución de venta con inventario perpetuo.';
COMMENT ON COLUMN "notas_comerciales"."observaciones" IS 'Notas o motivo de la nota.';
COMMENT ON COLUMN "notas_comerciales"."creado_por" IS 'Usuario que registró la nota.';
COMMENT ON COLUMN "notas_comerciales"."creado_en" IS 'Fecha y hora de registro.';

CREATE TABLE "notas_comerciales_lineas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nota_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "linea_documento_id" UUID,
    "producto_id" UUID,
    "cuenta_id" UUID,
    "descripcion" VARCHAR(200) NOT NULL,
    "clase_gravamen" "clase_gravamen" NOT NULL DEFAULT 'gravada',
    "cantidad" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "precio_unitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "monto" DECIMAL(14,2) NOT NULL,
    "movimiento_inventario_id" UUID,

    CONSTRAINT "notas_comerciales_lineas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notas_comerciales_lineas_valores" CHECK ("cantidad" >= 0 AND "precio_unitario" >= 0 AND "monto" > 0),
    CONSTRAINT "notas_comerciales_lineas_movimiento_con_producto" CHECK ("movimiento_inventario_id" IS NULL OR "producto_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "notas_comerciales_lineas_nota_id_orden_key" ON "notas_comerciales_lineas"("nota_id", "orden");
CREATE UNIQUE INDEX "notas_comerciales_lineas_movimiento_inventario_id_key" ON "notas_comerciales_lineas"("movimiento_inventario_id");
CREATE INDEX "notas_comerciales_lineas_linea_documento_idx" ON "notas_comerciales_lineas"("linea_documento_id");
CREATE INDEX "notas_comerciales_lineas_empresa_idx" ON "notas_comerciales_lineas"("empresa_id");

ALTER TABLE "notas_comerciales_lineas" ADD CONSTRAINT "notas_comerciales_lineas_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales_lineas" ADD CONSTRAINT "notas_comerciales_lineas_nota_id_empresa_id_fkey"
  FOREIGN KEY ("nota_id", "empresa_id") REFERENCES "notas_comerciales"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales_lineas" ADD CONSTRAINT "notas_comerciales_lineas_linea_documento_id_fkey"
  FOREIGN KEY ("linea_documento_id") REFERENCES "documentos_comerciales_lineas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales_lineas" ADD CONSTRAINT "notas_comerciales_lineas_producto_id_fkey"
  FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales_lineas" ADD CONSTRAINT "notas_comerciales_lineas_cuenta_id_fkey"
  FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notas_comerciales_lineas" ADD CONSTRAINT "notas_comerciales_lineas_movimiento_inventario_id_fkey"
  FOREIGN KEY ("movimiento_inventario_id") REFERENCES "movimientos_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "notas_comerciales_lineas" IS 'Líneas de una nota: la línea del documento que se devuelve o rebaja (con su movimiento del kardex si es una devolución) o, en un cargo, la cuenta contable que se carga.';
COMMENT ON COLUMN "notas_comerciales_lineas"."id" IS 'Identificador de la línea.';
COMMENT ON COLUMN "notas_comerciales_lineas"."empresa_id" IS 'Empresa dueña de la nota.';
COMMENT ON COLUMN "notas_comerciales_lineas"."nota_id" IS 'Nota a la que pertenece.';
COMMENT ON COLUMN "notas_comerciales_lineas"."orden" IS 'Posición de la línea dentro de la nota.';
COMMENT ON COLUMN "notas_comerciales_lineas"."linea_documento_id" IS 'Línea del documento original que se devuelve o rebaja; nula en un cargo adicional.';
COMMENT ON COLUMN "notas_comerciales_lineas"."producto_id" IS 'Producto del inventario que regresa o sale en una devolución; nulo en las demás líneas.';
COMMENT ON COLUMN "notas_comerciales_lineas"."cuenta_id" IS 'Cuenta contable de una línea de gasto, activo o ingreso (servicios y cargos); nula en las líneas de producto.';
COMMENT ON COLUMN "notas_comerciales_lineas"."descripcion" IS 'Descripción de la línea como figura en la nota.';
COMMENT ON COLUMN "notas_comerciales_lineas"."clase_gravamen" IS 'Gravada, exenta o no sujeta: la de la línea del documento original.';
COMMENT ON COLUMN "notas_comerciales_lineas"."cantidad" IS 'Unidades devueltas; cero en una rebaja o un cargo.';
COMMENT ON COLUMN "notas_comerciales_lineas"."precio_unitario" IS 'Precio por unidad del documento original; cero en un cargo.';
COMMENT ON COLUMN "notas_comerciales_lineas"."monto" IS 'Importe de la línea con la misma convención del documento original (sin IVA en un CCF; con IVA en una factura de consumidor final de una venta).';
COMMENT ON COLUMN "notas_comerciales_lineas"."movimiento_inventario_id" IS 'Entrada o salida del kardex que generó la devolución; nulo si no mueve inventario.';

-- Saldo por cobrar o por pagar de un documento al crédito: lo neto del documento, más las notas de débito, menos las
-- de crédito. Con p_borradores cuenta también las notas en borrador (para no pasarse mientras se contabilizan); sin
-- él solo las contabilizadas, que es lo que ve el mayor. Las notas anuladas no cuentan en ningún caso. Un documento
-- al contado no deja saldo. HU-62 amplía esta función con los abonos.
CREATE FUNCTION interno.saldo_documento(p_documento uuid, p_borradores boolean) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN d.condicion_pago = 'credito' THEN
      d.total_neto
      + coalesce((SELECT sum(n.total_neto) FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
                  WHERE n.documento_id = d.id AND n.tipo = 'debito'
                    AND (p.estado = 'contabilizada' OR (p_borradores AND p.estado = 'borrador'))), 0)
      - coalesce((SELECT sum(n.total_neto) FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
                  WHERE n.documento_id = d.id AND n.tipo = 'credito'
                    AND (p.estado = 'contabilizada' OR (p_borradores AND p.estado = 'borrador'))), 0)
    ELSE 0 END
  FROM documentos_comerciales d WHERE d.id = p_documento
$$;

COMMENT ON FUNCTION interno.saldo_documento(uuid, boolean) IS 'Saldo por cobrar o por pagar de un documento: total neto más notas de débito menos notas de crédito (y, desde HU-62, menos abonos); con p_borradores incluye lo que está en borrador.';

-- Coherencia entre la nota y el documento que corrige
CREATE FUNCTION interno.notas_comerciales_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  d record;
  codigo_pago text;
  partida_empresa uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'observaciones') IS DISTINCT FROM (to_jsonb(OLD) - 'observaciones') THEN
      RAISE EXCEPTION 'Una nota registrada solo admite cambiar sus observaciones' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  SELECT id, operacion, fecha, condicion_pago, tercero_id, partida_id INTO d
    FROM documentos_comerciales WHERE id = NEW.documento_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El documento no pertenece a la empresa de la nota' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF d.operacion <> NEW.operacion OR d.tercero_id IS DISTINCT FROM NEW.tercero_id THEN
    RAISE EXCEPTION 'La nota debe ser de la misma operación y del mismo cliente o proveedor que el documento'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.fecha < d.fecha THEN
    RAISE EXCEPTION 'La nota no puede ser anterior al documento que corrige' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM partidas WHERE id = d.partida_id AND estado = 'anulada';
  IF FOUND THEN
    RAISE EXCEPTION 'El documento tiene su partida anulada: no admite notas' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa de la nota' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF d.condicion_pago = 'contado' THEN
    IF NEW.cuenta_pago_id IS NULL THEN
      RAISE EXCEPTION 'Una nota sobre un documento al contado necesita la caja o el banco del reembolso o cobro'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT codigo INTO codigo_pago FROM cuentas WHERE id = NEW.cuenta_pago_id AND empresa_id = NEW.empresa_id;
    IF codigo_pago IS NULL OR codigo_pago NOT LIKE '1101%' THEN
      RAISE EXCEPTION 'La cuenta de pago debe ser una cuenta de efectivo (1101…) de la empresa' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.cuenta_pago_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una nota sobre un documento al crédito se aplica a su saldo, sin caja ni banco' USING ERRCODE = 'check_violation';
  ELSIF NEW.tipo = 'credito' AND NEW.total_neto > interno.saldo_documento(d.id, true) THEN
    RAISE EXCEPTION 'La nota de crédito supera el saldo pendiente del documento' USING ERRCODE = 'check_violation';
  END IF;
  SELECT empresa_id INTO partida_empresa FROM partidas WHERE id = NEW.partida_id;
  IF partida_empresa IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa de la nota' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.partida_costo_id IS NOT NULL THEN
    SELECT empresa_id INTO partida_empresa FROM partidas WHERE id = NEW.partida_costo_id;
    IF partida_empresa IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'La partida del costo no pertenece a la empresa de la nota' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Una línea de crédito corrige una línea del mismo documento sin devolver ni rebajar más de lo que tiene
CREATE FUNCTION interno.notas_comerciales_lineas_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n record;
  o record;
  ya_cantidad numeric;
  ya_monto numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Las líneas de una nota registrada no se modifican ni se borran' USING ERRCODE = 'check_violation';
  END IF;
  SELECT tipo, motivo, documento_id INTO n FROM notas_comerciales WHERE id = NEW.nota_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La nota no pertenece a la empresa de la línea' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.producto_id IS NOT NULL THEN
    PERFORM 1 FROM productos WHERE id = NEW.producto_id AND empresa_id = NEW.empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto no pertenece a la empresa de la nota' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  IF NEW.cuenta_id IS NOT NULL THEN
    PERFORM 1 FROM cuentas WHERE id = NEW.cuenta_id AND empresa_id = NEW.empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La cuenta no pertenece a la empresa de la nota' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  IF n.tipo = 'debito' THEN
    IF NEW.linea_documento_id IS NOT NULL OR NEW.cuenta_id IS NULL THEN
      RAISE EXCEPTION 'Un cargo adicional se asienta en una cuenta contable, no en una línea del documento'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.linea_documento_id IS NULL THEN
    RAISE EXCEPTION 'Una nota de crédito corrige una línea del documento' USING ERRCODE = 'check_violation';
  END IF;
  SELECT cantidad, monto, producto_id INTO o FROM documentos_comerciales_lineas
    WHERE id = NEW.linea_documento_id AND documento_id = n.documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La línea no es del documento que corrige la nota' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF n.motivo = 'devolucion' AND (NEW.cantidad <= 0 OR o.producto_id IS NULL OR NEW.producto_id IS DISTINCT FROM o.producto_id) THEN
    RAISE EXCEPTION 'Una devolución lleva las unidades de un producto del documento' USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(sum(l.cantidad), 0), coalesce(sum(l.monto), 0) INTO ya_cantidad, ya_monto
    FROM notas_comerciales_lineas l
    JOIN notas_comerciales x ON x.id = l.nota_id AND x.tipo = 'credito'
    JOIN partidas p ON p.id = x.partida_id AND p.estado <> 'anulada'
    WHERE l.linea_documento_id = NEW.linea_documento_id;
  IF ya_cantidad + NEW.cantidad > o.cantidad THEN
    RAISE EXCEPTION 'No se pueden devolver más unidades de las del documento' USING ERRCODE = 'check_violation';
  END IF;
  IF ya_monto + NEW.monto > o.monto THEN
    RAISE EXCEPTION 'La devolución o rebaja supera el importe de la línea del documento' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.notas_comerciales_sin_borrar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las notas de crédito y de débito no se borran: se anula su partida' USING ERRCODE = 'check_violation';
END $$;

-- Toda nota termina con al menos una línea (se revisa al confirmar la transacción)
CREATE FUNCTION interno.notas_comerciales_con_lineas() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM notas_comerciales_lineas WHERE nota_id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Una nota necesita al menos una línea' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION interno.notas_comerciales_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.notas_comerciales_lineas_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.notas_comerciales_sin_borrar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.notas_comerciales_con_lineas() FROM PUBLIC;

COMMENT ON FUNCTION interno.notas_comerciales_validar() IS 'Trigger de notas_comerciales: mismo cliente o proveedor y operación que el documento, fecha no anterior, caja o banco si el documento fue al contado, no superar el saldo si fue al crédito; después de registrada solo se editan las observaciones.';
COMMENT ON FUNCTION interno.notas_comerciales_lineas_validar() IS 'Trigger de notas_comerciales_lineas: producto y cuenta de la empresa; no se devuelve ni se rebaja más de lo que tiene la línea del documento; las líneas no se modifican.';
COMMENT ON FUNCTION interno.notas_comerciales_sin_borrar() IS 'Trigger de notas_comerciales y sus líneas: no se borran.';
COMMENT ON FUNCTION interno.notas_comerciales_con_lineas() IS 'Trigger diferido de notas_comerciales: la nota debe tener al menos una línea al confirmar.';

CREATE TRIGGER "notas_comerciales_validar_antes" BEFORE INSERT OR UPDATE ON "notas_comerciales"
  FOR EACH ROW EXECUTE FUNCTION interno.notas_comerciales_validar();
CREATE TRIGGER "notas_comerciales_sin_borrar" BEFORE DELETE ON "notas_comerciales"
  FOR EACH ROW EXECUTE FUNCTION interno.notas_comerciales_sin_borrar();
CREATE TRIGGER "notas_comerciales_lineas_validar_antes" BEFORE INSERT OR UPDATE ON "notas_comerciales_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.notas_comerciales_lineas_validar();
CREATE TRIGGER "notas_comerciales_lineas_sin_borrar" BEFORE DELETE ON "notas_comerciales_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.notas_comerciales_sin_borrar();
CREATE CONSTRAINT TRIGGER "notas_comerciales_con_lineas" AFTER INSERT ON "notas_comerciales"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.notas_comerciales_con_lineas();
CREATE TRIGGER "notas_comerciales_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "notas_comerciales"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "notas_comerciales_lineas_bitacora" AFTER INSERT ON "notas_comerciales_lineas"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Como el resto de tablas, no son visibles para la API de datos de Supabase
ALTER TABLE "notas_comerciales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notas_comerciales_lineas" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "notas_comerciales", "notas_comerciales_lineas" FROM anon, authenticated;
  END IF;
END $$;
