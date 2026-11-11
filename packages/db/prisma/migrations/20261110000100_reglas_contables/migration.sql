-- Reglas contables y de seguridad que el esquema de Prisma no puede expresar (HU-03).
-- Las funciones viven en el esquema "interno", que no se expone por la API de datos de Supabase.

CREATE SCHEMA IF NOT EXISTS interno;
REVOKE ALL ON SCHEMA interno FROM PUBLIC;

-- ───────────── Restricciones de valores ─────────────

ALTER TABLE partida_detalles
  ADD CONSTRAINT partida_detalles_debe_o_haber_check
  CHECK (debe >= 0 AND haber >= 0 AND ((debe > 0) <> (haber > 0)));

ALTER TABLE periodos ADD CONSTRAINT periodos_mes_check CHECK (mes BETWEEN 1 AND 12);
ALTER TABLE ejercicios ADD CONSTRAINT ejercicios_fechas_check CHECK (fecha_fin > fecha_inicio);
ALTER TABLE partidas ADD CONSTRAINT partidas_anulacion_check
  CHECK (estado <> 'anulada' OR motivo_anulacion IS NOT NULL);

-- ───────────── Fecha de actualización ─────────────

CREATE FUNCTION interno.tocar_actualizado_en() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas', 'sucursales', 'usuarios', 'membresias', 'cuentas', 'partidas'] LOOP
    EXECUTE format('CREATE TRIGGER %I_actualizado_en BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION interno.tocar_actualizado_en()', t, t);
  END LOOP;
END $$;

-- ───────────── Catálogo: nivel y cuenta padre según el código ─────────────

CREATE FUNCTION interno.cuentas_antes_guardar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  largos CONSTANT int[] := ARRAY[1, 2, 4, 6, 8, 10];
  pos int;
  padre uuid;
  codigo_padre text;
BEGIN
  IF NEW.codigo !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'El código de cuenta solo admite dígitos: %', NEW.codigo USING ERRCODE = 'check_violation';
  END IF;
  pos := array_position(largos, length(NEW.codigo));
  IF pos IS NULL THEN
    RAISE EXCEPTION 'Longitud de código inválida (% dígitos); se admiten 1, 2, 4, 6, 8 o 10', length(NEW.codigo)
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.codigo <> OLD.codigo
     AND EXISTS (SELECT 1 FROM partida_detalles WHERE cuenta_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede cambiar el código de la cuenta % porque tiene movimientos', OLD.codigo;
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

CREATE TRIGGER cuentas_antes_guardar BEFORE INSERT OR UPDATE OF codigo, empresa_id ON cuentas
  FOR EACH ROW EXECUTE FUNCTION interno.cuentas_antes_guardar();

-- ───────────── Ejercicios: generar los doce períodos ─────────────

CREATE FUNCTION interno.ejercicios_crear_periodos() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO periodos (empresa_id, ejercicio_id, mes, fecha_inicio, fecha_fin)
  SELECT NEW.empresa_id, NEW.id, extract(month FROM d)::smallint, d::date,
         least((d + interval '1 month' - interval '1 day')::date, NEW.fecha_fin)
  FROM generate_series(NEW.fecha_inicio::timestamp, NEW.fecha_fin::timestamp, interval '1 month') AS d;
  RETURN NULL;
END $$;

CREATE TRIGGER ejercicios_crear_periodos AFTER INSERT ON ejercicios
  FOR EACH ROW EXECUTE FUNCTION interno.ejercicios_crear_periodos();

-- ───────────── Períodos: cierre sin borradores pendientes ─────────────

CREATE FUNCTION interno.periodos_cambiar_estado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pendientes int;
BEGIN
  IF NEW.estado = 'cerrado' AND OLD.estado = 'abierto' THEN
    SELECT count(*) INTO pendientes FROM partidas WHERE periodo_id = NEW.id AND estado = 'borrador';
    IF pendientes > 0 THEN
      RAISE EXCEPTION 'No se puede cerrar el período: tiene % borradores pendientes', pendientes;
    END IF;
    NEW.cerrado_en := now();
  ELSIF NEW.estado = 'abierto' THEN
    NEW.cerrado_en := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER periodos_cambiar_estado BEFORE UPDATE OF estado ON periodos
  FOR EACH ROW EXECUTE FUNCTION interno.periodos_cambiar_estado();

-- ───────────── Correlativos sin saltos ni duplicados ─────────────
-- El UPSERT bloquea la fila del ámbito hasta el fin de la transacción: dos usuarios nunca obtienen
-- el mismo número, y si la transacción falla el número no se consume.

CREATE FUNCTION interno.siguiente_correlativo(p_empresa uuid, p_ambito text) RETURNS int LANGUAGE sql AS $$
  INSERT INTO correlativos (empresa_id, ambito, ultimo) VALUES (p_empresa, p_ambito, 1)
  ON CONFLICT (empresa_id, ambito) DO UPDATE SET ultimo = correlativos.ultimo + 1
  RETURNING ultimo;
$$;

-- ───────────── Partidas: período, estados y numeración ─────────────

CREATE FUNCTION interno.partidas_antes_guardar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  per record;
  per_anterior text;
  modo modo_numeracion;
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
    -- Anular solo marca la partida (la reversión se registra en un período abierto), por eso se permite
    -- aunque su período esté cerrado, siempre que no cambie nada más que el estado y sus datos de anulación.
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

  IF TG_OP = 'INSERT' THEN
    NEW.creado_por := coalesce(NEW.creado_por, usuario);
  ELSIF OLD.estado = 'contabilizada' THEN
    NEW.version := OLD.version + 1;  -- edición de una partida contabilizada: queda versionada en la bitácora
  END IF;

  IF NEW.estado = 'contabilizada' AND (TG_OP = 'INSERT' OR OLD.estado = 'borrador') THEN
    SELECT modo_numeracion INTO modo FROM empresas WHERE id = NEW.empresa_id;
    NEW.ambito_numeracion := CASE modo
      WHEN 'mensual' THEN to_char(NEW.fecha, 'YYYY-MM')
      WHEN 'por_tipo' THEN to_char(NEW.fecha, 'YYYY') || '-' || NEW.tipo
      ELSE to_char(NEW.fecha, 'YYYY') END;
    NEW.numero := interno.siguiente_correlativo(NEW.empresa_id, NEW.ambito_numeracion);
    NEW.contabilizado_en := now();
    NEW.contabilizado_por := coalesce(NEW.contabilizado_por, usuario);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER partidas_antes_guardar BEFORE INSERT OR UPDATE OR DELETE ON partidas
  FOR EACH ROW EXECUTE FUNCTION interno.partidas_antes_guardar();

-- ───────────── Detalle: cuentas válidas y partidas modificables ─────────────

CREATE FUNCTION interno.detalles_antes_guardar() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  par record;
  cta record;
BEGIN
  SELECT p.empresa_id, p.estado, per.estado AS estado_periodo INTO par
  FROM partidas p LEFT JOIN periodos per ON per.id = p.periodo_id
  WHERE p.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.partida_id ELSE NEW.partida_id END;

  IF FOUND THEN  -- si no existe es un borrado en cascada de la propia partida
    IF par.estado_periodo = 'cerrado' THEN
      RAISE EXCEPTION 'El período de la partida está cerrado';
    END IF;
    IF par.estado = 'anulada' THEN
      RAISE EXCEPTION 'La partida está anulada y no admite cambios';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.partida_id <> OLD.partida_id THEN
    RAISE EXCEPTION 'Una línea no puede moverse a otra partida';
  END IF;
  NEW.empresa_id := par.empresa_id;

  SELECT c.empresa_id, c.codigo, c.activa, EXISTS (SELECT 1 FROM cuentas h WHERE h.cuenta_padre_id = c.id) AS tiene_hijas
  INTO cta FROM cuentas c WHERE c.id = NEW.cuenta_id;
  IF cta.empresa_id <> par.empresa_id THEN
    RAISE EXCEPTION 'La cuenta pertenece a otra empresa';
  END IF;
  IF cta.tiene_hijas THEN
    RAISE EXCEPTION 'La cuenta % no es de último nivel; solo se registran movimientos en cuentas de último nivel', cta.codigo;
  END IF;
  IF NOT cta.activa AND (TG_OP = 'INSERT' OR NEW.cuenta_id <> OLD.cuenta_id) THEN
    RAISE EXCEPTION 'La cuenta % está inactiva', cta.codigo;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER detalles_antes_guardar BEFORE INSERT OR UPDATE OR DELETE ON partida_detalles
  FOR EACH ROW EXECUTE FUNCTION interno.detalles_antes_guardar();

-- ───────────── Cuadre: se verifica al confirmar la transacción ─────────────
-- Es diferido para que una partida y todas sus líneas se guarden juntas antes de comprobarla.

CREATE FUNCTION interno.verificar_cuadre() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  pid uuid;
  par record;
  tot record;
BEGIN
  IF TG_TABLE_NAME = 'partidas' THEN
    pid := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    pid := OLD.partida_id;
  ELSE
    pid := NEW.partida_id;
  END IF;
  SELECT estado, numero INTO par FROM partidas WHERE id = pid;
  IF NOT FOUND OR par.estado = 'borrador' THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(debe), 0) AS debe, coalesce(sum(haber), 0) AS haber, count(*) AS lineas
  INTO tot FROM partida_detalles WHERE partida_id = pid;
  IF tot.lineas < 2 OR tot.debe <> tot.haber OR tot.debe = 0 THEN
    RAISE EXCEPTION 'La partida % no cuadra: debe %, haber %, % líneas', coalesce(par.numero::text, '(sin número)'),
      tot.debe, tot.haber, tot.lineas
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER partidas_verificar_cuadre AFTER INSERT OR UPDATE ON partidas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.verificar_cuadre();
CREATE CONSTRAINT TRIGGER detalles_verificar_cuadre AFTER INSERT OR UPDATE OR DELETE ON partida_detalles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION interno.verificar_cuadre();

-- ───────────── Bitácora inmutable ─────────────
-- La API fija el usuario de cada transacción con: SELECT set_config('app.usuario_id', '<uuid>', true)

CREATE FUNCTION interno.registrar_bitacora() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  antes jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  despues jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  fila jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (antes - 'actualizado_en') = (despues - 'actualizado_en') THEN
    RETURN NULL;
  END IF;
  fila := coalesce(despues, antes);
  INSERT INTO bitacora (empresa_id, usuario_id, tabla, registro_id, accion, datos_anteriores, datos_nuevos)
  VALUES (
    (CASE WHEN TG_TABLE_NAME = 'empresas' THEN fila ->> 'id' ELSE fila ->> 'empresa_id' END)::uuid,
    nullif(current_setting('app.usuario_id', true), '')::uuid,
    TG_TABLE_NAME, fila ->> 'id', TG_OP, antes, despues);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas', 'sucursales', 'usuarios', 'membresias', 'membresia_sucursales', 'rol_permisos',
                           'cuentas', 'ejercicios', 'periodos', 'partidas', 'partida_detalles'] LOOP
    EXECUTE format('CREATE TRIGGER %I_bitacora AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION interno.registrar_bitacora()', t, t);
  END LOOP;
END $$;

CREATE FUNCTION interno.bitacora_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es inmutable: no se puede modificar, borrar ni vaciar';
END $$;

CREATE TRIGGER bitacora_sin_cambios BEFORE UPDATE OR DELETE ON bitacora
  FOR EACH ROW EXECUTE FUNCTION interno.bitacora_inmutable();
CREATE TRIGGER bitacora_sin_vaciar BEFORE TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION interno.bitacora_inmutable();

-- ───────────── Seguridad en Supabase ─────────────
-- La aplicación accede solo por la API (NestJS + Prisma con el rol dueño de las tablas).
-- La API de datos de Supabase (roles anon y authenticated) no debe ver ninguna tabla.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA interno FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA interno FROM PUBLIC;
