-- Pago a cuenta del 1.75 % y retenciones de renta del mes, para el F-14 (HU-49, S3-T46).
-- Guarda las cifras con que se generó la partida de determinación (Dr 111104 Pago a Cuenta / Cr 211101 Pago a Cuenta).
-- El cierre anual (HU-34) acredita el ISR con el saldo de la cuenta 111104, por eso esa partida debe contabilizarse.

CREATE TABLE "pagos_a_cuenta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "periodo" DATE NOT NULL,
    "tasa" DECIMAL(5,2) NOT NULL,
    "ingresos_brutos" DECIMAL(14,2) NOT NULL,
    "pago_a_cuenta" DECIMAL(14,2) NOT NULL,
    "retenciones_planilla" DECIMAL(14,2) NOT NULL,
    "retenciones_servicios" DECIMAL(14,2) NOT NULL,
    "partida_id" UUID NOT NULL,
    "presentada_por" UUID,
    "presentada_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_a_cuenta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagos_a_cuenta_periodo_inicio_mes" CHECK ("periodo" = date_trunc('month', "periodo")::date),
    CONSTRAINT "pagos_a_cuenta_tasa_valida" CHECK ("tasa" > 0 AND "tasa" <= 100),
    CONSTRAINT "pagos_a_cuenta_importes_no_negativos" CHECK (
      "ingresos_brutos" >= 0 AND "pago_a_cuenta" >= 0
      AND "retenciones_planilla" >= 0 AND "retenciones_servicios" >= 0
    ),
    CONSTRAINT "pagos_a_cuenta_presentacion_completa" CHECK (
      ("presentada_en" IS NULL) = ("presentada_por" IS NULL)
    ),
    CONSTRAINT "pagos_a_cuenta_empresa_id_fkey"
      FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pagos_a_cuenta_partida_id_fkey"
      FOREIGN KEY ("partida_id") REFERENCES "partidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pagos_a_cuenta_presentada_por_fkey"
      FOREIGN KEY ("presentada_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "pagos_a_cuenta_empresa_periodo_unq" UNIQUE ("empresa_id", "periodo")
);

CREATE UNIQUE INDEX "pagos_a_cuenta_partida_id_key" ON "pagos_a_cuenta"("partida_id");

COMMENT ON TABLE "pagos_a_cuenta" IS 'Pago a cuenta del ISR y retenciones de renta de un mes (F-14) con la partida de determinación generada.';
COMMENT ON COLUMN "pagos_a_cuenta"."id" IS 'Identificador de la liquidación mensual del F-14.';
COMMENT ON COLUMN "pagos_a_cuenta"."empresa_id" IS 'Empresa que declara.';
COMMENT ON COLUMN "pagos_a_cuenta"."periodo" IS 'Primer día del mes declarado.';
COMMENT ON COLUMN "pagos_a_cuenta"."tasa" IS 'Porcentaje del pago a cuenta aplicado a los ingresos brutos del mes (1.75).';
COMMENT ON COLUMN "pagos_a_cuenta"."ingresos_brutos" IS 'Ingresos brutos del mes (cuentas de ventas 5101) usados como base, al generar la partida.';
COMMENT ON COLUMN "pagos_a_cuenta"."pago_a_cuenta" IS 'Pago a cuenta determinado: ingresos brutos por la tasa, redondeado a centavos.';
COMMENT ON COLUMN "pagos_a_cuenta"."retenciones_planilla" IS 'Renta retenida a empleados en el mes (cuenta 210604, partidas de planilla), al generar la partida.';
COMMENT ON COLUMN "pagos_a_cuenta"."retenciones_servicios" IS 'Renta retenida por servicios en el mes (cuenta 210604, partidas que no son de planilla), al generar la partida.';
COMMENT ON COLUMN "pagos_a_cuenta"."partida_id" IS 'Partida de determinación del pago a cuenta (Dr 111104, Cr 211101).';
COMMENT ON COLUMN "pagos_a_cuenta"."presentada_por" IS 'Usuario que marcó el F-14 como presentado.';
COMMENT ON COLUMN "pagos_a_cuenta"."presentada_en" IS 'Fecha y hora en que se marcó el F-14 como presentado; vacío si aún no se presenta.';
COMMENT ON COLUMN "pagos_a_cuenta"."creado_en" IS 'Fecha y hora de creación del registro.';
COMMENT ON COLUMN "pagos_a_cuenta"."actualizado_en" IS 'Fecha y hora de la última actualización del registro.';

CREATE FUNCTION interno.pagos_a_cuenta_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_partida RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.presentada_en IS NOT NULL THEN
      RAISE EXCEPTION 'No se puede eliminar un pago a cuenta ya presentado'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.presentada_en IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar un pago a cuenta ya presentado'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.empresa_id, p.estado, p.fecha INTO v_partida FROM partidas p WHERE p.id = NEW.partida_id;
  IF NOT FOUND OR v_partida.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa del pago a cuenta'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_partida.fecha <> (date_trunc('month', NEW.periodo) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'La partida debe tener la fecha del último día del mes declarado'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.partida_id <> OLD.partida_id AND NOT EXISTS (
    SELECT 1 FROM partidas p WHERE p.id = OLD.partida_id AND p.estado = 'anulada'
  ) THEN
    RAISE EXCEPTION 'Solo se reemplaza la partida de un pago a cuenta cuando la anterior fue anulada'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.presentada_en IS NOT NULL AND v_partida.estado <> 'contabilizada' THEN
    RAISE EXCEPTION 'La partida del pago a cuenta debe estar contabilizada para presentarlo'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER "pagos_a_cuenta_validar_antes"
  BEFORE INSERT OR UPDATE OR DELETE ON "pagos_a_cuenta"
  FOR EACH ROW EXECUTE FUNCTION interno.pagos_a_cuenta_validar();
CREATE TRIGGER "pagos_a_cuenta_actualizado_en" BEFORE UPDATE ON "pagos_a_cuenta"
  FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en();
CREATE TRIGGER "pagos_a_cuenta_bitacora" AFTER INSERT OR UPDATE OR DELETE ON "pagos_a_cuenta"
  FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora();

REVOKE ALL ON FUNCTION interno.pagos_a_cuenta_validar() FROM PUBLIC;
COMMENT ON FUNCTION interno.pagos_a_cuenta_validar() IS 'Valida empresa, fecha y estado de la partida del pago a cuenta y bloquea cambios después de presentarlo.';

ALTER TABLE "pagos_a_cuenta" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "pagos_a_cuenta" FROM anon, authenticated;
  END IF;
END $$;
