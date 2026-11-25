-- Abonos de cuentas por cobrar y por pagar (HU-62, S3-T70): cobros a clientes y pagos a proveedores.
-- Un abono aplica un monto, parcial o total, a uno o varios documentos al crédito de un mismo cliente o proveedor y
-- lleva su partida en borrador contra caja o bancos. La base impide abonar más que el saldo de un documento y amplía el
-- saldo de documento de HU-61 con lo abonado.

CREATE TABLE "abonos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "operacion" "operacion_comercial" NOT NULL,
    "tercero_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "referencia" VARCHAR(60),
    "cuenta_pago_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "partida_id" UUID NOT NULL,
    "observaciones" VARCHAR(300),
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "abonos_monto_positivo" CHECK ("monto" > 0)
);

CREATE UNIQUE INDEX "abonos_id_empresa_id_key" ON "abonos"("id", "empresa_id");
CREATE UNIQUE INDEX "abonos_partida_id_key" ON "abonos"("partida_id");
CREATE INDEX "abonos_libro_idx" ON "abonos"("empresa_id", "operacion", "fecha");
CREATE INDEX "abonos_tercero_idx" ON "abonos"("tercero_id");
CREATE INDEX "abonos_sucursal_idx" ON "abonos"("sucursal_id");

ALTER TABLE "abonos" ADD CONSTRAINT "abonos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos" ADD CONSTRAINT "abonos_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos" ADD CONSTRAINT "abonos_tercero_id_empresa_id_fkey"
  FOREIGN KEY ("tercero_id", "empresa_id") REFERENCES "terceros"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos" ADD CONSTRAINT "abonos_cuenta_pago_id_fkey"
  FOREIGN KEY ("cuenta_pago_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos" ADD CONSTRAINT "abonos_partida_id_fkey"
  FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "abonos" IS 'Cobros a clientes (operación venta) y pagos a proveedores (operación compra) que aplican su monto a documentos al crédito y se contabilizan contra caja o bancos.';
COMMENT ON COLUMN "abonos"."id" IS 'Identificador del abono.';
COMMENT ON COLUMN "abonos"."empresa_id" IS 'Empresa que registra el abono.';
COMMENT ON COLUMN "abonos"."sucursal_id" IS 'Sucursal que registra el abono.';
COMMENT ON COLUMN "abonos"."operacion" IS 'Venta (cobro a un cliente, cuentas por cobrar) o compra (pago a un proveedor, cuentas por pagar).';
COMMENT ON COLUMN "abonos"."tercero_id" IS 'Cliente que paga o proveedor al que se paga; todos los documentos del abono son suyos.';
COMMENT ON COLUMN "abonos"."fecha" IS 'Fecha del cobro o pago; no es anterior a la de los documentos que abona.';
COMMENT ON COLUMN "abonos"."referencia" IS 'Número de recibo, cheque, transferencia o remesa del cobro o pago.';
COMMENT ON COLUMN "abonos"."cuenta_pago_id" IS 'Cuenta contable de efectivo (caja o banco) donde entra el cobro o de donde sale el pago.';
COMMENT ON COLUMN "abonos"."monto" IS 'Monto total del abono; es la suma de lo aplicado a sus documentos.';
COMMENT ON COLUMN "abonos"."partida_id" IS 'Partida que contabiliza el abono (caja o banco contra cuentas por cobrar o por pagar); nace en borrador.';
COMMENT ON COLUMN "abonos"."observaciones" IS 'Notas del abono.';
COMMENT ON COLUMN "abonos"."creado_por" IS 'Usuario que registró el abono.';
COMMENT ON COLUMN "abonos"."creado_en" IS 'Fecha y hora de registro.';

CREATE TABLE "abonos_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "abono_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "abonos_documentos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "abonos_documentos_monto_positivo" CHECK ("monto" > 0)
);

CREATE UNIQUE INDEX "abonos_documentos_abono_id_documento_id_key" ON "abonos_documentos"("abono_id", "documento_id");
CREATE INDEX "abonos_documentos_documento_idx" ON "abonos_documentos"("documento_id");
CREATE INDEX "abonos_documentos_empresa_idx" ON "abonos_documentos"("empresa_id");

ALTER TABLE "abonos_documentos" ADD CONSTRAINT "abonos_documentos_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos_documentos" ADD CONSTRAINT "abonos_documentos_abono_id_empresa_id_fkey"
  FOREIGN KEY ("abono_id", "empresa_id") REFERENCES "abonos"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "abonos_documentos" ADD CONSTRAINT "abonos_documentos_documento_id_empresa_id_fkey"
  FOREIGN KEY ("documento_id", "empresa_id") REFERENCES "documentos_comerciales"("id", "empresa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "abonos_documentos" IS 'Reparto de un abono entre los documentos al crédito que cancela, total o parcialmente.';
COMMENT ON COLUMN "abonos_documentos"."id" IS 'Identificador de la aplicación.';
COMMENT ON COLUMN "abonos_documentos"."empresa_id" IS 'Empresa dueña del abono.';
COMMENT ON COLUMN "abonos_documentos"."abono_id" IS 'Abono que aplica el monto.';
COMMENT ON COLUMN "abonos_documentos"."documento_id" IS 'Documento al crédito que recibe el abono.';
COMMENT ON COLUMN "abonos_documentos"."monto" IS 'Parte del abono que se aplica a este documento; no supera su saldo.';

-- Saldo por cobrar o por pagar de un documento al crédito (HU-61) menos lo abonado. Con p_borradores cuenta también lo
-- que está en borrador (notas y abonos); sin él solo lo contabilizado, que es lo que ve el mayor. Lo anulado no cuenta.
CREATE OR REPLACE FUNCTION interno.saldo_documento(p_documento uuid, p_borradores boolean) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN d.condicion_pago = 'credito' THEN
      d.total_neto
      + coalesce((SELECT sum(n.total_neto) FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
                  WHERE n.documento_id = d.id AND n.tipo = 'debito'
                    AND (p.estado = 'contabilizada' OR (p_borradores AND p.estado = 'borrador'))), 0)
      - coalesce((SELECT sum(n.total_neto) FROM notas_comerciales n JOIN partidas p ON p.id = n.partida_id
                  WHERE n.documento_id = d.id AND n.tipo = 'credito'
                    AND (p.estado = 'contabilizada' OR (p_borradores AND p.estado = 'borrador'))), 0)
      - coalesce((SELECT sum(x.monto) FROM abonos_documentos x JOIN abonos a ON a.id = x.abono_id
                  JOIN partidas p ON p.id = a.partida_id
                  WHERE x.documento_id = d.id
                    AND (p.estado = 'contabilizada' OR (p_borradores AND p.estado = 'borrador'))), 0)
    ELSE 0 END
  FROM documentos_comerciales d WHERE d.id = p_documento
$$;

COMMENT ON FUNCTION interno.saldo_documento(uuid, boolean) IS 'Saldo por cobrar o por pagar de un documento: total neto más notas de débito menos notas de crédito y abonos; con p_borradores incluye lo que está en borrador.';

-- Coherencia del abono con su cliente o proveedor, su sucursal, su caja o banco y su partida
CREATE FUNCTION interno.abonos_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
  codigo_pago text;
  partida_empresa uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'observaciones') IS DISTINCT FROM (to_jsonb(OLD) - 'observaciones') THEN
      RAISE EXCEPTION 'Un abono registrado solo admite cambiar sus observaciones' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa del abono' USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT es_cliente, es_proveedor INTO t FROM terceros WHERE id = NEW.tercero_id AND empresa_id = NEW.empresa_id;
  IF NEW.operacion = 'venta' AND NOT coalesce(t.es_cliente, false) THEN
    RAISE EXCEPTION 'El tercero de un cobro debe ser un cliente' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.operacion = 'compra' AND NOT coalesce(t.es_proveedor, false) THEN
    RAISE EXCEPTION 'El tercero de un pago debe ser un proveedor' USING ERRCODE = 'check_violation';
  END IF;
  SELECT codigo INTO codigo_pago FROM cuentas WHERE id = NEW.cuenta_pago_id AND empresa_id = NEW.empresa_id;
  IF codigo_pago IS NULL OR codigo_pago NOT LIKE '1101%' THEN
    RAISE EXCEPTION 'La cuenta del abono debe ser una cuenta de efectivo (1101…) de la empresa' USING ERRCODE = 'check_violation';
  END IF;
  SELECT empresa_id INTO partida_empresa FROM partidas WHERE id = NEW.partida_id;
  IF partida_empresa IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa del abono' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

-- Un abono aplica a documentos al crédito del mismo cliente o proveedor y de la misma operación, sin pasar su saldo
CREATE FUNCTION interno.abonos_documentos_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a record;
  d record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Las aplicaciones de un abono registrado no se modifican ni se borran' USING ERRCODE = 'check_violation';
  END IF;
  SELECT operacion, tercero_id, fecha INTO a FROM abonos WHERE id = NEW.abono_id AND empresa_id = NEW.empresa_id;
  SELECT x.operacion, x.tercero_id, x.fecha, x.condicion_pago, p.estado AS estado_partida INTO d
    FROM documentos_comerciales x JOIN partidas p ON p.id = x.partida_id
    WHERE x.id = NEW.documento_id AND x.empresa_id = NEW.empresa_id;
  IF a IS NULL OR d IS NULL THEN
    RAISE EXCEPTION 'El abono y el documento deben ser de la misma empresa' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF d.operacion <> a.operacion OR d.tercero_id IS DISTINCT FROM a.tercero_id THEN
    RAISE EXCEPTION 'El abono solo aplica a documentos de su mismo cliente o proveedor y operación' USING ERRCODE = 'check_violation';
  END IF;
  IF d.condicion_pago <> 'credito' THEN
    RAISE EXCEPTION 'Solo se abona a documentos al crédito' USING ERRCODE = 'check_violation';
  END IF;
  IF d.estado_partida = 'anulada' THEN
    RAISE EXCEPTION 'El documento tiene su partida anulada: no admite abonos' USING ERRCODE = 'check_violation';
  END IF;
  IF a.fecha < d.fecha THEN
    RAISE EXCEPTION 'El abono no puede ser anterior al documento' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.monto > interno.saldo_documento(NEW.documento_id, true) THEN
    RAISE EXCEPTION 'El abono supera el saldo pendiente del documento' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION interno.abonos_sin_borrar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los abonos no se borran: se anula su partida' USING ERRCODE = 'check_violation';
END $$;

-- Lo aplicado a los documentos debe sumar exactamente el monto del abono (se revisa al confirmar la transacción)
CREATE FUNCTION interno.abonos_reparto_completo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  aplicado numeric;
BEGIN
  SELECT coalesce(sum(monto), 0) INTO aplicado FROM abonos_documentos WHERE abono_id = NEW.id;
  IF aplicado <> NEW.monto THEN
    RAISE EXCEPTION 'Lo aplicado a los documentos (%) debe sumar el monto del abono (%)', aplicado, NEW.monto
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION interno.abonos_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.abonos_documentos_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.abonos_sin_borrar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.abonos_reparto_completo() FROM PUBLIC;

COMMENT ON FUNCTION interno.abonos_validar() IS 'Trigger de abonos: cliente o proveedor según la operación, sucursal, cuenta de efectivo y partida de la empresa; después de registrado solo se editan las observaciones.';
COMMENT ON FUNCTION interno.abonos_documentos_validar() IS 'Trigger de abonos_documentos: documento al crédito del mismo cliente o proveedor y operación, no anterior al abono ni por más que su saldo; las aplicaciones no se modifican.';
COMMENT ON FUNCTION interno.abonos_sin_borrar() IS 'Trigger de abonos y sus aplicaciones: no se borran.';
COMMENT ON FUNCTION interno.abonos_reparto_completo() IS 'Trigger diferido de abonos: lo aplicado a los documentos suma el monto del abono al confirmar.';

CREATE TRIGGER "abonos_validar_antes" BEFORE INSERT OR UPDATE ON "abonos"
  FOR EACH ROW EXECUTE FUNCTION interno.abonos_validar();
CREATE TRIGGER "abonos_sin_borrar" BEFORE DELETE ON "abonos"
  FOR EACH ROW EXECUTE FUNCTION interno.abonos_sin_borrar();
CREATE TRIGGER "abonos_documentos_validar_antes" BEFORE INSERT OR UPDATE ON "abonos_documentos"
  FOR EACH ROW EXECUTE FUNCTION interno.abonos_documentos_validar();
CREATE TRIGGER "abonos_documentos_sin_borrar" BEFORE DELETE ON "abonos_documentos"
  FOR EACH ROW EXECUTE FUNCTION interno.abonos_sin_borrar();
CREATE CONSTRAINT TRIGGER "abonos_reparto_completo" AFTER INSERT ON "abonos"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.abonos_reparto_completo();
CREATE TRIGGER "abonos_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "abonos"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "abonos_documentos_bitacora" AFTER INSERT ON "abonos_documentos"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

-- Como el resto de tablas, no son visibles para la API de datos de Supabase
ALTER TABLE "abonos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "abonos_documentos" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "abonos", "abonos_documentos" FROM anon, authenticated;
  END IF;
END $$;
