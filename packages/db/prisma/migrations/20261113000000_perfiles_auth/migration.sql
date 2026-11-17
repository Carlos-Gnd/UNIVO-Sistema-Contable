-- Perfil en usuarios para cada cuenta de Supabase Auth con el correo confirmado (HU-05, HU-08).
--
-- Los permisos, las membresías y la bitácora usan la tabla usuarios, cuyo id es el de auth.users. Este
-- trigger crea el perfil en cuanto la cuenta confirma su correo y mantiene el correo al día. Así una
-- cuenta confirmada nunca queda sin perfil: por ejemplo, alguien que creó su cuenta pero todavía no usó la
-- API ya puede recibir una membresía por invitación.
--
-- Solo cuentas con el correo CONFIRMADO: si se creara el perfil al registrarse, cualquiera podría abrir
-- una cuenta con el correo de otra persona sin confirmarlo, y la invitación a una empresa (que busca el
-- perfil por correo) le daría la membresía a esa cuenta. Las cuentas invitadas (inviteUserByEmail) aún
-- no confirman su correo: su perfil lo crea la API al invitar, ligado al id que devuelve Supabase.
--
-- El esquema auth solo existe en Supabase. En el PostgreSQL local y en el de CI la instalación no hace
-- nada; las pruebas simulan auth.users y llaman a interno.instalar_perfiles_auth().

-- Registra el perfil de una cuenta confirmada. Nunca falla: si el id o el correo ya existen en usuarios,
-- no hace nada; las cuentas sin correo (por ejemplo, solo teléfono) no tienen perfil.
CREATE FUNCTION interno.registrar_perfil(p_id uuid, p_correo text, p_meta jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO usuarios (id, correo, nombre)
  SELECT p_id, lower(btrim(p_correo)),
         left(coalesce(nullif(btrim(p_meta ->> 'nombre'), ''),
                       nullif(btrim(p_meta ->> 'full_name'), ''),
                       split_part(btrim(p_correo), '@', 1)), 150)
  WHERE nullif(btrim(p_correo), '') IS NOT NULL
  ON CONFLICT DO NOTHING;
$$;

-- Trigger: crea el perfil al registrarse una cuenta ya confirmada o cuando la cuenta confirma su correo.
CREATE FUNCTION interno.crear_perfil_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM interno.registrar_perfil(NEW.id, NEW.email, NEW.raw_user_meta_data);
  END IF;
  RETURN NEW;
END $$;

-- Trigger: mantiene el correo del perfil cuando cambia en Auth (Supabase solo cambia auth.users.email
-- después de confirmar el correo nuevo). Si el nuevo correo ya es de otro perfil, deja el anterior y avisa
-- en el log en lugar de impedir el cambio en Auth.
CREATE FUNCTION interno.actualizar_correo_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email_confirmed_at IS NOT NULL
     AND nullif(btrim(NEW.email), '') IS NOT NULL THEN
    BEGIN
      UPDATE usuarios SET correo = lower(btrim(NEW.email)) WHERE id = NEW.id;
    EXCEPTION WHEN unique_violation THEN
      RAISE WARNING 'El correo % ya pertenece a otro usuario; el perfil % conserva el anterior', NEW.email, NEW.id;
    END;
  END IF;
  RETURN NEW;
END $$;

-- Instala los triggers sobre auth.users y crea los perfiles de las cuentas confirmadas que ya existían.
-- Es idempotente y no hace nada donde no existe auth.users.
CREATE FUNCTION interno.instalar_perfiles_auth() RETURNS boolean
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RETURN false;
  END IF;
  DROP TRIGGER IF EXISTS crear_perfil_usuario ON auth.users;
  DROP TRIGGER IF EXISTS actualizar_correo_usuario ON auth.users;
  CREATE TRIGGER crear_perfil_usuario AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION interno.crear_perfil_usuario();
  CREATE TRIGGER actualizar_correo_usuario AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION interno.actualizar_correo_usuario();

  PERFORM interno.registrar_perfil(a.id, a.email, a.raw_user_meta_data)
  FROM auth.users a
  WHERE a.email_confirmed_at IS NOT NULL;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION interno.registrar_perfil(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.crear_perfil_usuario() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.actualizar_correo_usuario() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.instalar_perfiles_auth() FROM PUBLIC;

COMMENT ON FUNCTION interno.registrar_perfil(uuid, text, jsonb) IS 'Crea el perfil en usuarios de una cuenta de Supabase Auth con el correo confirmado; no hace nada si ya existe.';
COMMENT ON FUNCTION interno.crear_perfil_usuario() IS 'Trigger de auth.users: crea el perfil cuando la cuenta tiene el correo confirmado.';
COMMENT ON FUNCTION interno.actualizar_correo_usuario() IS 'Trigger de auth.users: mantiene el correo del perfil cuando cambia en Supabase Auth.';
COMMENT ON FUNCTION interno.instalar_perfiles_auth() IS 'Instala los triggers de perfiles sobre auth.users y crea los perfiles faltantes; no hace nada fuera de Supabase.';

SELECT interno.instalar_perfiles_auth();
