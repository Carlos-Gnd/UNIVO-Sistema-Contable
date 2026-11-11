-- Correcciones de la revisión del PR #181: cambios posteriores a la contabilización, jerarquía de cuentas,
-- ejercicios traslapados y motivo de reapertura de períodos (HU-33).

-- ───────────── Motivo de reapertura ─────────────
ALTER TABLE periodos ADD COLUMN motivo_reapertura text;
COMMENT ON COLUMN periodos.motivo_reapertura IS 'Motivo de la última reapertura del período; obligatorio para reabrir y registrado en la bitácora.';

CREATE OR REPLACE FUNCTION interno.periodos_cambiar_estado() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE pendientes int;
BEGIN
  IF NEW.estado = 'cerrado' AND OLD.estado = 'abierto' THEN
    SELECT count(*) INTO pendientes FROM partidas WHERE periodo_id = NEW.id AND estado = 'borrador';
    IF pendientes > 0 THEN
      RAISE EXCEPTION 'No se puede cerrar el período: tiene % borradores pendientes', pendientes;
    END IF;
    NEW.cerrado_en := now();
  ELSIF NEW.estado = 'abierto' AND OLD.estado = 'cerrado' THEN
    IF nullif(btrim(NEW.motivo_reapertura), '') IS NULL
       OR NEW.motivo_reapertura IS NOT DISTINCT FROM OLD.motivo_reapertura THEN
      RAISE EXCEPTION 'Para reabrir un período cerrado indique el motivo de la reapertura';
    END IF;
    NEW.cerrado_en := NULL;
  END IF;
  RETURN NEW;
END $$;

-- El trigger se disparaba solo con cambios de estado; ahora también vigila el motivo
DROP TRIGGER periodos_cambiar_estado ON periodos;
CREATE TRIGGER periodos_cambiar_estado BEFORE UPDATE OF estado, motivo_reapertura ON periodos
  FOR EACH ROW EXECUTE FUNCTION interno.periodos_cambiar_estado();

-- ───────────── Ejercicios: sin traslapes ni cambios de fechas ─────────────
CREATE FUNCTION interno.ejercicios_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.fecha_inicio <> OLD.fecha_inicio OR NEW.fecha_fin <> OLD.fecha_fin OR NEW.empresa_id <> OLD.empresa_id THEN
      RAISE EXCEPTION 'Las fechas y la empresa de un ejercicio no se pueden cambiar después de crearlo';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM ejercicios e
             WHERE e.empresa_id = NEW.empresa_id
               AND daterange(e.fecha_inicio, e.fecha_fin, '[]') && daterange(NEW.fecha_inicio, NEW.fecha_fin, '[]')) THEN
    RAISE EXCEPTION 'El ejercicio % se traslapa con otro ejercicio de la empresa', NEW.anio;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER ejercicios_validar BEFORE INSERT OR UPDATE ON ejercicios
  FOR EACH ROW EXECUTE FUNCTION interno.ejercicios_validar();

-- ───────────── Cuentas: jerarquía estable ─────────────
CREATE OR REPLACE FUNCTION interno.cuentas_antes_guardar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  largos CONSTANT int[] := ARRAY[1, 2, 4, 6, 8, 10];
  pos int;
  padre uuid;
  codigo_padre text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.empresa_id <> OLD.empresa_id THEN
      RAISE EXCEPTION 'Una cuenta no se puede mover a otra empresa';
    END IF;
    IF NEW.codigo = OLD.codigo THEN
      RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM cuentas WHERE cuenta_padre_id = OLD.id) THEN
      RAISE EXCEPTION 'No se puede cambiar el código de la cuenta % porque tiene subcuentas', OLD.codigo;
    END IF;
    IF EXISTS (SELECT 1 FROM partida_detalles WHERE cuenta_id = OLD.id) THEN
      RAISE EXCEPTION 'No se puede cambiar el código de la cuenta % porque tiene movimientos', OLD.codigo;
    END IF;
  END IF;

  IF NEW.codigo !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'El código de cuenta solo admite dígitos: %', NEW.codigo USING ERRCODE = 'check_violation';
  END IF;
  pos := array_position(largos, length(NEW.codigo));
  IF pos IS NULL THEN
    RAISE EXCEPTION 'Longitud de código inválida (% dígitos); se admiten 1, 2, 4, 6, 8 o 10', length(NEW.codigo)
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.nivel := pos;
  IF pos = 1 THEN
    NEW.cuenta_padre_id := NULL;
  ELSE
    codigo_padre := left(NEW.codigo, largos[pos - 1]);
    SELECT id INTO padre FROM cuentas WHERE empresa_id = NEW.empresa_id AND codigo = codigo_padre;
    IF padre IS NULL THEN
      RAISE EXCEPTION 'No existe la cuenta padre % para la cuenta %', codigo_padre, NEW.codigo
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM partida_detalles WHERE cuenta_id = padre) THEN
      RAISE EXCEPTION 'La cuenta % tiene movimientos; no se le pueden crear subcuentas', codigo_padre;
    END IF;
    NEW.cuenta_padre_id := padre;
  END IF;
  RETURN NEW;
END $$;

-- ───────────── Partidas: numeración protegida ─────────────
-- El ámbito de numeración se calcula en un solo lugar para usarlo al contabilizar y al validar ediciones.
CREATE FUNCTION interno.ambito_numeracion(p_empresa uuid, p_fecha date, p_tipo tipo_partida) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE e.modo_numeracion
    WHEN 'mensual' THEN to_char(p_fecha, 'YYYY-MM')
    WHEN 'por_tipo' THEN to_char(p_fecha, 'YYYY') || '-' || p_tipo
    ELSE to_char(p_fecha, 'YYYY') END
  FROM empresas e WHERE e.id = p_empresa;
$$;
REVOKE ALL ON FUNCTION interno.ambito_numeracion(uuid, date, tipo_partida) FROM PUBLIC;

CREATE OR REPLACE FUNCTION interno.partidas_antes_guardar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  per record;
  per_anterior text;
  ambito_nuevo text;
  usuario uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'Solo se eliminan borradores; anule la partida mediante una reversión';
    END IF;
    SELECT estado::text INTO per_anterior FROM periodos WHERE id = OLD.periodo_id;
    IF per_anterior = 'cerrado' THEN
      RAISE EXCEPTION 'El período de la partida está cerrado';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado = 'anulada' THEN
      RAISE EXCEPTION 'La partida está anulada y no admite cambios';
    END IF;
    IF OLD.estado = 'contabilizada' AND NEW.estado = 'borrador' THEN
      RAISE EXCEPTION 'Una partida contabilizada no puede volver a borrador';
    END IF;
    IF OLD.estado = 'contabilizada' AND NEW.estado = 'anulada' THEN
      IF (to_jsonb(NEW) - ARRAY['estado', 'anulado_por', 'anulado_en', 'motivo_anulacion', 'actualizado_en'])
         <> (to_jsonb(OLD) - ARRAY['estado', 'anulado_por', 'anulado_en', 'motivo_anulacion', 'actualizado_en']) THEN
        RAISE EXCEPTION 'Al anular una partida solo se registra el motivo; no se pueden cambiar sus datos';
      END IF;
      NEW.anulado_en := coalesce(NEW.anulado_en, now());
      NEW.anulado_por := coalesce(NEW.anulado_por, usuario);
      RETURN NEW;
    END IF;
    SELECT estado::text INTO per_anterior FROM periodos WHERE id = OLD.periodo_id;
    IF per_anterior = 'cerrado' THEN
      RAISE EXCEPTION 'El período de la partida está cerrado';
    END IF;
    IF OLD.estado = 'contabilizada' THEN
      -- el número, su ámbito y los datos de contabilización no se editan
      IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.ambito_numeracion IS DISTINCT FROM OLD.ambito_numeracion THEN
        RAISE EXCEPTION 'El número de una partida contabilizada no se puede modificar';
      END IF;
      NEW.contabilizado_en := OLD.contabilizado_en;
      NEW.contabilizado_por := OLD.contabilizado_por;
      NEW.creado_por := OLD.creado_por;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sucursales WHERE id = NEW.sucursal_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa de la partida';
  END IF;

  SELECT id, estado INTO per FROM periodos
  WHERE empresa_id = NEW.empresa_id AND NEW.fecha BETWEEN fecha_inicio AND fecha_fin;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe un período para la fecha %; cree primero el ejercicio', to_char(NEW.fecha, 'DD/MM/YYYY');
  END IF;
  IF per.estado = 'cerrado' THEN
    RAISE EXCEPTION 'El período de % está cerrado', to_char(NEW.fecha, 'MM/YYYY');
  END IF;
  NEW.periodo_id := per.id;
  ambito_nuevo := interno.ambito_numeracion(NEW.empresa_id, NEW.fecha, NEW.tipo);

  IF TG_OP = 'INSERT' THEN
    NEW.creado_por := coalesce(NEW.creado_por, usuario);
  ELSIF OLD.estado = 'contabilizada' THEN
    -- moverla de ámbito dejaría un hueco en el correlativo viejo y un número ajeno en el nuevo
    IF ambito_nuevo <> OLD.ambito_numeracion THEN
      RAISE EXCEPTION 'La fecha o el tipo llevan la partida a otro ámbito de numeración (% → %); anúlela y regístrela de nuevo',
        OLD.ambito_numeracion, ambito_nuevo;
    END IF;
    NEW.version := OLD.version + 1;
  END IF;

  IF NEW.estado = 'borrador' THEN
    -- un borrador nunca tiene número
    NEW.numero := NULL;
    NEW.ambito_numeracion := NULL;
    NEW.contabilizado_en := NULL;
    NEW.contabilizado_por := NULL;
  ELSIF NEW.estado = 'contabilizada' AND (TG_OP = 'INSERT' OR OLD.estado = 'borrador') THEN
    NEW.ambito_numeracion := ambito_nuevo;
    NEW.numero := interno.siguiente_correlativo(NEW.empresa_id, ambito_nuevo);
    NEW.contabilizado_en := now();
    NEW.contabilizado_por := coalesce(NEW.contabilizado_por, usuario);
  END IF;
  RETURN NEW;
END $$;
