-- Cheques, remesas y notas bancarias con partidas en borrador e historial de anulación (HU-78, S3-T118).
-- Cada operación afecta una cuenta bancaria y una cuenta de contrapartida de la misma empresa.

CREATE TYPE "tipo_movimiento_bancario" AS ENUM ('cheque', 'remesa', 'nota_cargo', 'nota_abono');
CREATE TYPE "estado_cheque_bancario" AS ENUM ('emitido', 'cobrado', 'anulado');

CREATE TABLE "movimientos_bancarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "cuenta_tesoreria_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "cuenta_contrapartida_id" UUID NOT NULL,
    "tipo" "tipo_movimiento_bancario" NOT NULL,
    "fecha" DATE NOT NULL,
    "referencia" VARCHAR(60) NOT NULL,
    "comprobante" VARCHAR(60) NOT NULL,
    "beneficiario" VARCHAR(150),
    "concepto" VARCHAR(200) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "estado_cheque" "estado_cheque_bancario",
    "fecha_estado" DATE,
    "partida_id" UUID NOT NULL,
    "partida_anulacion_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_bancarios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimientos_bancarios_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "movimientos_bancarios_estado_cheque" CHECK (
      ("tipo" = 'cheque' AND "estado_cheque" IS NOT NULL)
      OR ("tipo" <> 'cheque' AND "estado_cheque" IS NULL)
    ),
    CONSTRAINT "movimientos_bancarios_fecha_estado" CHECK (
      ("estado_cheque" = 'emitido' AND "fecha_estado" IS NULL)
      OR ("estado_cheque" IN ('cobrado', 'anulado') AND "fecha_estado" IS NOT NULL)
      OR ("estado_cheque" IS NULL AND "fecha_estado" IS NULL)
    ),
    CONSTRAINT "movimientos_bancarios_anulacion_solo_cheque" CHECK (
      "partida_anulacion_id" IS NULL OR ("tipo" = 'cheque' AND "estado_cheque" = 'anulado')
    )
);

CREATE UNIQUE INDEX "movimientos_bancarios_id_empresa_id_key" ON "movimientos_bancarios"("id", "empresa_id");
CREATE UNIQUE INDEX "movimientos_bancarios_empresa_id_cuenta_tesoreria_id_referencia_key"
  ON "movimientos_bancarios"("empresa_id", "cuenta_tesoreria_id", "referencia");
CREATE UNIQUE INDEX "movimientos_bancarios_partida_id_key" ON "movimientos_bancarios"("partida_id");
CREATE UNIQUE INDEX "movimientos_bancarios_partida_anulacion_id_key" ON "movimientos_bancarios"("partida_anulacion_id");
CREATE INDEX "movimientos_bancarios_empresa_id_cuenta_tesoreria_id_fecha_idx"
  ON "movimientos_bancarios"("empresa_id", "cuenta_tesoreria_id", "fecha");

ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_cuenta_tesoreria_id_fkey"
  FOREIGN KEY ("cuenta_tesoreria_id") REFERENCES "cuentas_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_cuenta_contrapartida_id_fkey"
  FOREIGN KEY ("cuenta_contrapartida_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_partida_id_fkey"
  FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_partida_anulacion_id_fkey"
  FOREIGN KEY ("partida_anulacion_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "movimientos_bancarios" IS 'Cheques, remesas y notas de cargo o abono vinculados a partidas en borrador.';
COMMENT ON COLUMN "movimientos_bancarios"."id" IS 'Identificador del movimiento bancario.';
COMMENT ON COLUMN "movimientos_bancarios"."empresa_id" IS 'Empresa dueña del movimiento.';
COMMENT ON COLUMN "movimientos_bancarios"."cuenta_tesoreria_id" IS 'Cuenta bancaria que recibe o entrega el dinero.';
COMMENT ON COLUMN "movimientos_bancarios"."sucursal_id" IS 'Sucursal del movimiento y de sus partidas.';
COMMENT ON COLUMN "movimientos_bancarios"."cuenta_contrapartida_id" IS 'Cuenta imputable contra la que se registra el movimiento.';
COMMENT ON COLUMN "movimientos_bancarios"."tipo" IS 'Cheque, remesa, nota de cargo o nota de abono.';
COMMENT ON COLUMN "movimientos_bancarios"."fecha" IS 'Fecha del movimiento bancario.';
COMMENT ON COLUMN "movimientos_bancarios"."referencia" IS 'Número de cheque, remesa o referencia del banco, única por cuenta.';
COMMENT ON COLUMN "movimientos_bancarios"."comprobante" IS 'Número del comprobante o documento de respaldo.';
COMMENT ON COLUMN "movimientos_bancarios"."beneficiario" IS 'Proveedor o persona beneficiaria, si aplica.';
COMMENT ON COLUMN "movimientos_bancarios"."concepto" IS 'Descripción breve del movimiento.';
COMMENT ON COLUMN "movimientos_bancarios"."monto" IS 'Importe positivo del movimiento, en dólares.';
COMMENT ON COLUMN "movimientos_bancarios"."estado_cheque" IS 'Estado del cheque: emitido, cobrado o anulado; nulo para otros movimientos.';
COMMENT ON COLUMN "movimientos_bancarios"."fecha_estado" IS 'Fecha en que el cheque se cobró o anuló.';
COMMENT ON COLUMN "movimientos_bancarios"."partida_id" IS 'Partida original en borrador que respalda el movimiento.';
COMMENT ON COLUMN "movimientos_bancarios"."partida_anulacion_id" IS 'Partida inversa en borrador que respalda la anulación del cheque.';
COMMENT ON COLUMN "movimientos_bancarios"."creado_en" IS 'Fecha y hora de registro.';

CREATE FUNCTION interno.movimientos_bancarios_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  banco RECORD;
  contrapartida RECORD;
  partida RECORD;
  reversa RECORD;
  lineas RECORD;
  debe_banco DECIMAL(14,2);
  haber_banco DECIMAL(14,2);
  debe_contra DECIMAL(14,2);
  haber_contra DECIMAL(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM sucursales s
      WHERE s.id = NEW.sucursal_id AND s.empresa_id = NEW.empresa_id AND s.activa
    ) THEN
      RAISE EXCEPTION 'La sucursal no pertenece a la empresa o está inactiva.' USING ERRCODE = 'P0001';
    END IF;

    SELECT ct.empresa_id, ct.sucursal_id, ct.tipo::text AS tipo, ct.activa, ct.cuenta_id
      INTO banco FROM cuentas_tesoreria ct WHERE ct.id = NEW.cuenta_tesoreria_id;
    IF NOT FOUND OR banco.empresa_id <> NEW.empresa_id OR banco.tipo <> 'banco' OR NOT banco.activa THEN
      RAISE EXCEPTION 'El movimiento requiere una cuenta bancaria activa de esta empresa.' USING ERRCODE = 'P0001';
    END IF;
    IF banco.sucursal_id IS NOT NULL AND banco.sucursal_id <> NEW.sucursal_id THEN
      RAISE EXCEPTION 'La cuenta bancaria pertenece a otra sucursal.' USING ERRCODE = 'P0001';
    END IF;

    SELECT c.empresa_id, c.activa, c.tipo::text AS tipo INTO contrapartida
      FROM cuentas c WHERE c.id = NEW.cuenta_contrapartida_id;
    IF NOT FOUND OR contrapartida.empresa_id <> NEW.empresa_id OR NOT contrapartida.activa
       OR EXISTS (SELECT 1 FROM cuentas h WHERE h.empresa_id = NEW.empresa_id AND h.cuenta_padre_id = NEW.cuenta_contrapartida_id) THEN
      RAISE EXCEPTION 'La contrapartida debe ser una cuenta activa e imputable de esta empresa.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tipo = 'cheque' AND NEW.estado_cheque <> 'emitido' THEN
      RAISE EXCEPTION 'Un cheque debe iniciar en estado emitido.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.tipo <> 'cheque' AND NEW.estado_cheque IS NOT NULL THEN
      RAISE EXCEPTION 'Solo los cheques tienen estado.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.partida_anulacion_id IS NOT NULL THEN
      RAISE EXCEPTION 'El movimiento inicia sin partida de anulación.' USING ERRCODE = 'P0001';
    END IF;

    SELECT p.empresa_id, p.sucursal_id, p.estado::text AS estado, p.origen, p.origen_id
      INTO partida FROM partidas p WHERE p.id = NEW.partida_id;
    IF NOT FOUND OR partida.empresa_id <> NEW.empresa_id OR partida.sucursal_id <> NEW.sucursal_id
       OR partida.estado <> 'borrador' OR partida.origen <> 'movimiento_bancario' OR partida.origen_id <> NEW.id THEN
      RAISE EXCEPTION 'La partida no corresponde al movimiento bancario.' USING ERRCODE = 'P0001';
    END IF;

    IF NEW.tipo IN ('cheque', 'nota_cargo') THEN
      debe_banco := 0; haber_banco := NEW.monto; debe_contra := NEW.monto; haber_contra := 0;
    ELSE
      debe_banco := NEW.monto; haber_banco := 0; debe_contra := 0; haber_contra := NEW.monto;
    END IF;
    SELECT count(*) AS cantidad, coalesce(sum(d.debe), 0) AS debe, coalesce(sum(d.haber), 0) AS haber,
           coalesce(bool_or(d.cuenta_id = banco.cuenta_id AND d.debe = debe_banco AND d.haber = haber_banco), false) AS linea_banco,
           coalesce(bool_or(d.cuenta_id = NEW.cuenta_contrapartida_id AND d.debe = debe_contra AND d.haber = haber_contra), false) AS linea_contra
      INTO lineas FROM partida_detalles d WHERE d.partida_id = NEW.partida_id;
    IF lineas.cantidad <> 2 OR lineas.debe <> NEW.monto OR lineas.haber <> NEW.monto
       OR NOT lineas.linea_banco OR NOT lineas.linea_contra THEN
      RAISE EXCEPTION 'La partida del movimiento debe registrar el importe completo y quedar balanceada.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Los movimientos bancarios no se eliminan.' USING ERRCODE = 'P0001';
  END IF;
  IF (OLD.id, OLD.empresa_id, OLD.cuenta_tesoreria_id, OLD.sucursal_id, OLD.cuenta_contrapartida_id,
      OLD.tipo, OLD.fecha, OLD.referencia, OLD.comprobante, OLD.beneficiario, OLD.concepto, OLD.monto,
      OLD.partida_id, OLD.creado_en)
     IS DISTINCT FROM
     (NEW.id, NEW.empresa_id, NEW.cuenta_tesoreria_id, NEW.sucursal_id, NEW.cuenta_contrapartida_id,
      NEW.tipo, NEW.fecha, NEW.referencia, NEW.comprobante, NEW.beneficiario, NEW.concepto, NEW.monto,
      NEW.partida_id, NEW.creado_en)
     OR OLD.tipo <> 'cheque' OR OLD.estado_cheque <> 'emitido'
     OR NEW.estado_cheque NOT IN ('cobrado', 'anulado') THEN
    RAISE EXCEPTION 'El movimiento es inmutable; el cheque emitido solo puede cobrarse o anularse.' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estado_cheque = 'cobrado' THEN
    IF NEW.partida_anulacion_id IS NOT NULL OR NEW.fecha_estado IS NULL THEN
      RAISE EXCEPTION 'Un cheque cobrado no puede tener partida de anulación.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.partida_anulacion_id IS NULL THEN
    RAISE EXCEPTION 'La anulación del cheque requiere una partida inversa.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.fecha_estado IS NULL THEN
    RAISE EXCEPTION 'La anulación del cheque requiere su fecha.' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.empresa_id, p.sucursal_id, p.estado::text AS estado, p.origen, p.origen_id
    INTO reversa FROM partidas p WHERE p.id = NEW.partida_anulacion_id;
  IF NOT FOUND OR reversa.empresa_id <> NEW.empresa_id OR reversa.sucursal_id <> NEW.sucursal_id
     OR reversa.estado <> 'borrador' OR reversa.origen <> 'movimiento_bancario_anulacion' OR reversa.origen_id <> NEW.id THEN
    RAISE EXCEPTION 'La partida inversa no corresponde a la anulación del cheque.' USING ERRCODE = 'P0001';
  END IF;
  SELECT ct.cuenta_id INTO banco FROM cuentas_tesoreria ct WHERE ct.id = NEW.cuenta_tesoreria_id;
  SELECT count(*) AS cantidad, coalesce(sum(d.debe), 0) AS debe, coalesce(sum(d.haber), 0) AS haber,
         coalesce(bool_or(d.cuenta_id = banco.cuenta_id AND d.debe = NEW.monto AND d.haber = 0), false) AS linea_banco,
         coalesce(bool_or(d.cuenta_id = NEW.cuenta_contrapartida_id AND d.debe = 0 AND d.haber = NEW.monto), false) AS linea_contra
    INTO lineas FROM partida_detalles d WHERE d.partida_id = NEW.partida_anulacion_id;
  IF lineas.cantidad <> 2 OR lineas.debe <> NEW.monto OR lineas.haber <> NEW.monto
     OR NOT lineas.linea_banco OR NOT lineas.linea_contra THEN
    RAISE EXCEPTION 'La partida inversa debe cancelar el cheque por el importe completo.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION interno.movimientos_bancarios_no_truncar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se puede vaciar el historial de movimientos bancarios.' USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION interno.movimientos_bancarios_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.movimientos_bancarios_no_truncar() FROM PUBLIC;

CREATE TRIGGER "movimientos_bancarios_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "movimientos_bancarios"
  FOR EACH ROW EXECUTE FUNCTION interno.movimientos_bancarios_validar();
CREATE TRIGGER "movimientos_bancarios_no_truncar" BEFORE TRUNCATE ON "movimientos_bancarios"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.movimientos_bancarios_no_truncar();
CREATE TRIGGER "movimientos_bancarios_bitacora" AFTER INSERT OR UPDATE ON "movimientos_bancarios"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

ALTER TABLE "movimientos_bancarios" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "movimientos_bancarios" FROM anon, authenticated;
  END IF;
END $$;
