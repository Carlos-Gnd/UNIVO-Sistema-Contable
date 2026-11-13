-- Perfil en usuarios para cada cuenta de Supabase Auth (HU-05, HU-08).
--
-- Los permisos, las membresías y la bitácora usan la tabla usuarios, cuyo id es el de auth.users. Este
-- trigger crea el perfil en cuanto existe la cuenta (registro, invitación o creación desde el panel) y
-- mantiene el correo al día. Así una cuenta nunca queda sin perfil: por ejemplo, alguien que creó su
-- cuenta pero todavía no usó la API ya puede recibir una membresía por invitación.
--
-- El esquema auth solo existe en Supabase. En el PostgreSQL local y en el de CI la instalación no hace
-- nada; las pruebas simulan auth.users y llaman a interno.instalar_perfiles_auth().

-- Crea el perfil al registrarse la cuenta. Nunca hace fallar el registro en Auth: si el id o el correo
-- ya existen en usuarios, no hace nada. Las cuentas sin correo (por ejemplo, solo teléfono) no tienen perfil.
CREATE FUNCTION interno.crear_perfil_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;
  INSERT INTO usuarios (id, correo, nombre)
  VALUES (
    NEW.id,
    lower(btrim(NEW.email)),
    left(coalesce(
      nullif(btrim(NEW.raw_user_meta_data ->> 'nombre'), ''),
      nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      split_part(btrim(NEW.email), '@', 1)
    ), 150)
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- Mantiene el correo del perfil cuando cambia en Auth. Si el nuevo correo ya es de otro perfil, deja el
-- anterior y avisa en el log en lugar de impedir el cambio en Auth.
CREATE FUNCTION interno.actualizar_correo_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    BEGIN
      UPDATE usuarios SET correo = lower(btrim(NEW.email)) WHERE id = NEW.id;
    EXCEPTION WHEN unique_violation THEN
      RAISE WARNING 'El correo % ya pertenece a otro usuario; el perfil % conserva el anterior', NEW.email, NEW.id;
    END;
  END IF;
  RETURN NEW;
END $$;

-- Instala los triggers sobre auth.users y crea los perfiles de las cuentas que ya existían.
-- Es idempotente y no hace nada donde no existe auth.users.
CREATE FUNCTION interno.instalar_perfiles_auth() RETURNS boolean
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RETURN false;
  END IF;
  DROP TRIGGER IF EXISTS crear_perfil_usuario ON auth.users;
  DROP TRIGGER IF EXISTS actualizar_correo_usuario ON auth.users;
  CREATE TRIGGER crear_perfil_usuario AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION interno.crear_perfil_usuario();
  CREATE TRIGGER actualizar_correo_usuario AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION interno.actualizar_correo_usuario();

  INSERT INTO usuarios (id, correo, nombre)
  SELECT a.id, lower(btrim(a.email)),
         left(coalesce(nullif(btrim(a.raw_user_meta_data ->> 'nombre'), ''),
                       nullif(btrim(a.raw_user_meta_data ->> 'full_name'), ''),
                       split_part(btrim(a.email), '@', 1)), 150)
  FROM auth.users a
  WHERE a.email IS NOT NULL AND btrim(a.email) <> ''
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION interno.crear_perfil_usuario() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.actualizar_correo_usuario() FROM PUBLIC;
REVOKE ALL ON FUNCTION interno.instalar_perfiles_auth() FROM PUBLIC;

COMMENT ON FUNCTION interno.crear_perfil_usuario() IS 'Trigger de auth.users: crea el perfil en usuarios al registrarse una cuenta de Supabase Auth.';
COMMENT ON FUNCTION interno.actualizar_correo_usuario() IS 'Trigger de auth.users: mantiene el correo del perfil cuando cambia en Supabase Auth.';
COMMENT ON FUNCTION interno.instalar_perfiles_auth() IS 'Instala los triggers de perfiles sobre auth.users y crea los perfiles faltantes; no hace nada fuera de Supabase.';

SELECT interno.instalar_perfiles_auth();
