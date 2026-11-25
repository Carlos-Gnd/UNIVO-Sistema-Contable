-- Documentos de compra y venta (HU-59, HU-60): la partida que contabiliza el documento debe nacer en borrador y
-- apuntar al documento. Antes el trigger solo exigía que fuera de la misma empresa; así, un documento podía colgarse
-- de una partida ya contabilizada o de otro origen (una partida manual, la de otro documento) y el libro de IVA y la
-- partida dejaban de coincidir.
--   · partida_id: estado borrador, origen «compras» o «ventas» según la operación, origen_id = id del documento.
--   · partida_costo_id: estado borrador, origen «ventas_costo», origen_id = id del documento.

CREATE OR REPLACE FUNCTION interno.documentos_comerciales_validar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t record;
  p record;
  codigo_pago text;
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

  SELECT empresa_id, estado::text AS estado, origen, origen_id INTO p FROM partidas WHERE id = NEW.partida_id;
  IF p.empresa_id IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La partida no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF p.estado <> 'borrador' THEN
    RAISE EXCEPTION 'La partida del documento debe estar en borrador al registrarlo' USING ERRCODE = 'check_violation';
  END IF;
  IF p.origen IS DISTINCT FROM (CASE NEW.operacion WHEN 'compra' THEN 'compras' ELSE 'ventas' END)
     OR p.origen_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'La partida debe tener como origen este documento (origen % con el id del documento)',
      CASE NEW.operacion WHEN 'compra' THEN 'compras' ELSE 'ventas' END USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.partida_costo_id IS NOT NULL THEN
    SELECT empresa_id, estado::text AS estado, origen, origen_id INTO p FROM partidas WHERE id = NEW.partida_costo_id;
    IF p.empresa_id IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'La partida del costo no pertenece a la empresa del documento' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF p.estado <> 'borrador' THEN
      RAISE EXCEPTION 'La partida del costo debe estar en borrador al registrar el documento' USING ERRCODE = 'check_violation';
    END IF;
    IF p.origen IS DISTINCT FROM 'ventas_costo' OR p.origen_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'La partida del costo debe tener como origen este documento (origen ventas_costo con el id del documento)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION interno.documentos_comerciales_validar() IS 'Trigger de documentos_comerciales: sucursal, proveedor o cliente, cuenta de efectivo y partidas de la empresa; la partida (y la del costo) nace en borrador con origen compras, ventas o ventas_costo y el id del documento; después de registrado solo se editan las observaciones.';
