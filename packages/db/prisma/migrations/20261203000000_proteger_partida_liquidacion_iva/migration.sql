-- Protege la partida de la liquidación del IVA (HU-48, correcciones de la revisión), igual que la del pago a cuenta (HU-49).
-- (a) La partida enlazada debe tener origen «liquidacion_iva» y su origen_id es el id de la liquidación.
-- (b) Presentado el F-07, la partida enlazada no se puede anular.
-- (c) Al presentar, las líneas de la partida deben coincidir con la liquidación guardada (detecta ediciones del borrador).

CREATE OR REPLACE FUNCTION interno.liquidaciones_iva_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_partida RECORD;
  v_lineas RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.presentada_en IS NOT NULL THEN
      RAISE EXCEPTION 'No se puede eliminar una liquidación de IVA ya presentada'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.presentada_en IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede modificar una liquidación de IVA ya presentada'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.empresa_id, p.estado, p.fecha, p.origen, p.origen_id INTO v_partida
    FROM partidas p WHERE p.id = NEW.partida_id;
  IF NOT FOUND OR v_partida.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa de la liquidación de IVA'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_partida.origen <> 'liquidacion_iva' THEN
    RAISE EXCEPTION 'La partida de una liquidación de IVA debe tener origen «liquidacion_iva»'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_partida.origen_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'La partida debe apuntar a esta liquidación de IVA (origen_id)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_partida.fecha <> (date_trunc('month', NEW.periodo) + interval '1 month - 1 day')::date THEN
    RAISE EXCEPTION 'La partida debe tener la fecha del último día del mes declarado'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.partida_id <> OLD.partida_id AND NOT EXISTS (
    SELECT 1 FROM partidas p WHERE p.id = OLD.partida_id AND p.estado = 'anulada'
  ) THEN
    RAISE EXCEPTION 'Solo se reemplaza la partida de una liquidación de IVA cuando la anterior fue anulada'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.presentada_en IS NOT NULL AND v_partida.estado <> 'contabilizada' THEN
    RAISE EXCEPTION 'La partida de la liquidación de IVA debe estar contabilizada para presentarla'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.presentada_en IS NOT NULL THEN
    -- Dr 2109 por el débito fiscal; Cr 211103 por el IVA por pagar; el resto del haber son los créditos usados
    SELECT COALESCE(SUM(d.debe), 0) AS debe, COALESCE(SUM(d.haber), 0) AS haber,
           COALESCE(SUM(d.debe) FILTER (WHERE c.codigo = '2109'), 0) AS debe_debito,
           COALESCE(SUM(d.haber) FILTER (WHERE c.codigo = '211103'), 0) AS haber_por_pagar
      INTO v_lineas
      FROM partida_detalles d JOIN cuentas c ON c.id = d.cuenta_id
      WHERE d.partida_id = NEW.partida_id;
    IF v_lineas.debe <> NEW.debito_fiscal OR v_lineas.haber <> NEW.debito_fiscal
       OR v_lineas.debe_debito <> NEW.debito_fiscal OR v_lineas.haber_por_pagar <> NEW.iva_por_pagar THEN
      RAISE EXCEPTION 'Las líneas de la partida no coinciden con la liquidación del IVA (Dr 2109 por el débito fiscal y Cr 211103 por el IVA por pagar)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION interno.liquidaciones_iva_validar() IS 'Valida empresa, origen, fecha, estado y monto de la partida de la liquidación de IVA y bloquea cambios después de presentarla.';

CREATE FUNCTION interno.partidas_proteger_liquidacion_iva() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'anulada' AND OLD.estado <> 'anulada' AND EXISTS (
    SELECT 1 FROM liquidaciones_iva li WHERE li.partida_id = OLD.id AND li.presentada_en IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'No se puede anular la partida de una liquidación de IVA ya presentada'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION interno.partidas_proteger_liquidacion_iva() FROM PUBLIC;
COMMENT ON FUNCTION interno.partidas_proteger_liquidacion_iva() IS 'Impide anular la partida de liquidación de una liquidación de IVA (F-07) que ya fue presentada.';

CREATE TRIGGER "partidas_proteger_liquidacion_iva"
  BEFORE UPDATE OF "estado" ON "partidas"
  FOR EACH ROW EXECUTE FUNCTION interno.partidas_proteger_liquidacion_iva();
