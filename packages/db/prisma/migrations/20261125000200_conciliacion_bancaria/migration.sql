-- Conciliación bancaria, saldo de estado de cuenta y movimientos marcados (HU-79, S3-T121).

CREATE TABLE "conciliaciones_bancarias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "cuenta_tesoreria_id" UUID NOT NULL,
    "fecha_corte" DATE NOT NULL,
    "saldo_estado" DECIMAL(14,2) NOT NULL,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conciliaciones_bancarias_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conciliaciones_bancarias_saldo_estado_no_negativo" CHECK ("saldo_estado" >= 0)
);
CREATE UNIQUE INDEX "conciliaciones_bancarias_id_empresa_id_key" ON "conciliaciones_bancarias"("id", "empresa_id");
CREATE UNIQUE INDEX "conciliaciones_bancarias_empresa_cuenta_fecha_key"
  ON "conciliaciones_bancarias"("empresa_id", "cuenta_tesoreria_id", "fecha_corte");
CREATE INDEX "conciliaciones_bancarias_empresa_fecha_idx" ON "conciliaciones_bancarias"("empresa_id", "fecha_corte");
ALTER TABLE "conciliaciones_bancarias" ADD CONSTRAINT "conciliaciones_bancarias_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conciliaciones_bancarias" ADD CONSTRAINT "conciliaciones_bancarias_cuenta_tesoreria_id_fkey"
  FOREIGN KEY ("cuenta_tesoreria_id") REFERENCES "cuentas_tesoreria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conciliaciones_bancarias" ADD CONSTRAINT "conciliaciones_bancarias_creado_por_fkey"
  FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMENT ON TABLE "conciliaciones_bancarias" IS 'Corte de conciliación bancaria por cuenta y fecha.';
COMMENT ON COLUMN "conciliaciones_bancarias"."id" IS 'Identificador de la conciliación.';
COMMENT ON COLUMN "conciliaciones_bancarias"."empresa_id" IS 'Empresa dueña de la conciliación.';
COMMENT ON COLUMN "conciliaciones_bancarias"."cuenta_tesoreria_id" IS 'Cuenta bancaria conciliada.';
COMMENT ON COLUMN "conciliaciones_bancarias"."fecha_corte" IS 'Último día del período conciliado.';
COMMENT ON COLUMN "conciliaciones_bancarias"."saldo_estado" IS 'Saldo final informado por el banco a la fecha de corte.';
COMMENT ON COLUMN "conciliaciones_bancarias"."creado_por" IS 'Usuario que inició el corte.';
COMMENT ON COLUMN "conciliaciones_bancarias"."creado_en" IS 'Fecha y hora de creación.';

CREATE TABLE "detalles_conciliacion_bancaria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "conciliacion_id" UUID NOT NULL,
    "partida_detalle_id" UUID NOT NULL,
    "conciliado" BOOLEAN NOT NULL DEFAULT FALSE,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "detalles_conciliacion_bancaria_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "detalles_conciliacion_bancaria_conciliacion_linea_key"
  ON "detalles_conciliacion_bancaria"("conciliacion_id", "partida_detalle_id");
CREATE INDEX "detalles_conciliacion_bancaria_empresa_estado_idx"
  ON "detalles_conciliacion_bancaria"("empresa_id", "conciliacion_id", "conciliado");
ALTER TABLE "detalles_conciliacion_bancaria" ADD CONSTRAINT "detalles_conciliacion_bancaria_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalles_conciliacion_bancaria" ADD CONSTRAINT "detalles_conciliacion_bancaria_conciliacion_id_fkey"
  FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "detalles_conciliacion_bancaria" ADD CONSTRAINT "detalles_conciliacion_bancaria_partida_detalle_id_fkey"
  FOREIGN KEY ("partida_detalle_id") REFERENCES "partida_detalles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMENT ON TABLE "detalles_conciliacion_bancaria" IS 'Líneas del libro marcadas en una conciliación bancaria.';
COMMENT ON COLUMN "detalles_conciliacion_bancaria"."id" IS 'Identificador del detalle conciliado.';
COMMENT ON COLUMN "detalles_conciliacion_bancaria"."empresa_id" IS 'Empresa dueña del detalle.';
COMMENT ON COLUMN "detalles_conciliacion_bancaria"."conciliacion_id" IS 'Corte al que pertenece la marca.';
COMMENT ON COLUMN "detalles_conciliacion_bancaria"."partida_detalle_id" IS 'Línea bancaria de una partida contabilizada.';
COMMENT ON COLUMN "detalles_conciliacion_bancaria"."conciliado" IS 'Indica si la línea aparece en el estado de cuenta.';
COMMENT ON COLUMN "detalles_conciliacion_bancaria"."actualizado_en" IS 'Última actualización de la marca.';

CREATE FUNCTION interno.conciliacion_bancaria_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  corte RECORD;
  linea RECORD;
BEGIN
  IF TG_TABLE_NAME = 'conciliaciones_bancarias' THEN
    IF TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'El corte de conciliación es inmutable.' USING ERRCODE = 'P0001';
    END IF;
    SELECT ct.empresa_id, ct.tipo::text AS tipo, ct.activa INTO corte
      FROM cuentas_tesoreria ct WHERE ct.id = NEW.cuenta_tesoreria_id;
    IF NOT FOUND OR corte.empresa_id <> NEW.empresa_id OR corte.tipo <> 'banco' OR NOT corte.activa THEN
      RAISE EXCEPTION 'La cuenta de conciliación debe ser un banco activo de la empresa.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las marcas de conciliación no se eliminan.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT c.empresa_id, c.fecha_corte, ct.cuenta_id INTO corte
      FROM conciliaciones_bancarias c JOIN cuentas_tesoreria ct ON ct.id = c.cuenta_tesoreria_id
      WHERE c.id = NEW.conciliacion_id;
    SELECT d.empresa_id, d.cuenta_id, d.debe, d.haber, p.estado::text AS estado, p.fecha
      INTO linea FROM partida_detalles d JOIN partidas p ON p.id = d.partida_id WHERE d.id = NEW.partida_detalle_id;
    IF corte.empresa_id IS DISTINCT FROM NEW.empresa_id OR linea.empresa_id IS DISTINCT FROM NEW.empresa_id
       OR linea.cuenta_id IS DISTINCT FROM corte.cuenta_id OR linea.estado NOT IN ('contabilizada', 'anulada')
       OR linea.fecha > corte.fecha_corte OR (linea.debe = 0 AND linea.haber = 0) THEN
      RAISE EXCEPTION 'La línea debe ser un movimiento contabilizado de esa cuenta y anterior al corte.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.id, OLD.empresa_id, OLD.conciliacion_id, OLD.partida_detalle_id)
     IS DISTINCT FROM (NEW.id, NEW.empresa_id, NEW.conciliacion_id, NEW.partida_detalle_id) THEN
    RAISE EXCEPTION 'La relación de conciliación es inmutable.' USING ERRCODE = 'P0001';
  END IF;
  NEW.actualizado_en := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE FUNCTION interno.conciliacion_bancaria_no_truncar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'No se puede vaciar el historial de conciliaciones bancarias.' USING ERRCODE = 'P0001';
END;
$$;
REVOKE ALL ON FUNCTION interno.conciliacion_bancaria_validar() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.conciliacion_bancaria_no_truncar() FROM PUBLIC;
CREATE TRIGGER "conciliaciones_bancarias_validar_antes" BEFORE INSERT OR UPDATE OR DELETE ON "conciliaciones_bancarias"
  FOR EACH ROW EXECUTE FUNCTION interno.conciliacion_bancaria_validar();
CREATE TRIGGER "detalles_conciliacion_bancaria_validar_antes" BEFORE INSERT OR UPDATE OR DELETE ON "detalles_conciliacion_bancaria"
  FOR EACH ROW EXECUTE FUNCTION interno.conciliacion_bancaria_validar();
CREATE TRIGGER "conciliaciones_bancarias_no_truncar" BEFORE TRUNCATE ON "conciliaciones_bancarias"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.conciliacion_bancaria_no_truncar();
CREATE TRIGGER "detalles_conciliacion_bancaria_no_truncar" BEFORE TRUNCATE ON "detalles_conciliacion_bancaria"
  FOR EACH STATEMENT EXECUTE FUNCTION interno.conciliacion_bancaria_no_truncar();
CREATE TRIGGER "conciliaciones_bancarias_bitacora" AFTER INSERT ON "conciliaciones_bancarias"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
CREATE TRIGGER "detalles_conciliacion_bancaria_bitacora" AFTER INSERT OR UPDATE ON "detalles_conciliacion_bancaria"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();
ALTER TABLE "conciliaciones_bancarias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "detalles_conciliacion_bancaria" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "conciliaciones_bancarias", "detalles_conciliacion_bancaria" FROM anon, authenticated;
  END IF;
END $$;
