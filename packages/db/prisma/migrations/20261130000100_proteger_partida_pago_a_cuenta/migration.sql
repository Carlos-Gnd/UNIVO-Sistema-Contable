-- Protege la partida de determinación del pago a cuenta (HU-49, correcciones de la revisión).
-- (a) La partida enlazada debe ser de origen «pago_a_cuenta» y su origen_id es el id de la declaración.
-- (b) Presentado el F-14, la partida enlazada no se puede anular.
-- (c) Al presentar, las líneas de la partida deben coincidir con el pago a cuenta guardado (detecta ediciones del borrador).

CREATE OR REPLACE FUNCTION interno.pagos_a_cuenta_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_partida RECORD;
  v_lineas RECORD;
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

  SELECT p.empresa_id, p.estado, p.fecha, p.origen, p.origen_id INTO v_partida
    FROM partidas p WHERE p.id = NEW.partida_id;
  IF NOT FOUND OR v_partida.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa del pago a cuenta'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_partida.fecha <> (date_trunc('month', NEW.periodo) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'La partida debe tener la fecha del último día del mes declarado'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_partida.origen <> 'pago_a_cuenta' OR v_partida.origen_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'La partida debe tener origen pago_a_cuenta y apuntar a esta declaración'
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

  IF NEW.presentada_en IS NOT NULL THEN
    SELECT COALESCE(SUM(d.debe), 0) AS debe, COALESCE(SUM(d.haber), 0) AS haber,
           COALESCE(SUM(d.debe) FILTER (WHERE c.codigo = '111104'), 0) AS debe_activo,
           COALESCE(SUM(d.haber) FILTER (WHERE c.codigo = '211101'), 0) AS haber_pasivo
      INTO v_lineas
      FROM partida_detalles d JOIN cuentas c ON c.id = d.cuenta_id
      WHERE d.partida_id = NEW.partida_id;
    IF v_lineas.debe <> NEW.pago_a_cuenta OR v_lineas.haber <> NEW.pago_a_cuenta
       OR v_lineas.debe_activo <> NEW.pago_a_cuenta OR v_lineas.haber_pasivo <> NEW.pago_a_cuenta THEN
      RAISE EXCEPTION 'Las líneas de la partida no coinciden con el pago a cuenta determinado (Dr 111104 y Cr 211101 por el mismo monto)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION interno.pagos_a_cuenta_validar() IS 'Valida empresa, fecha, origen, estado y monto de la partida del pago a cuenta y bloquea cambios después de presentarlo.';

CREATE FUNCTION interno.partidas_proteger_pago_a_cuenta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'anulada' AND OLD.estado <> 'anulada' AND EXISTS (
    SELECT 1 FROM pagos_a_cuenta pc WHERE pc.partida_id = OLD.id AND pc.presentada_en IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se puede anular la partida de un pago a cuenta ya presentado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.partidas_proteger_pago_a_cuenta() FROM PUBLIC;
COMMENT ON FUNCTION interno.partidas_proteger_pago_a_cuenta() IS 'Impide anular la partida de determinación de un pago a cuenta (F-14) que ya fue presentado.';

CREATE TRIGGER "partidas_proteger_pago_a_cuenta"
  BEFORE UPDATE OF "estado" ON "partidas"
  FOR EACH ROW EXECUTE FUNCTION interno.partidas_proteger_pago_a_cuenta();

COMMENT ON COLUMN "pagos_a_cuenta"."ingresos_brutos" IS 'Ingresos brutos del mes (Art. 151 del Código Tributario) usados como base, al generar la partida: ventas 5101 y otros ingresos de la clase 52 (sin 5202), menos devoluciones y rebajas 4103.';
