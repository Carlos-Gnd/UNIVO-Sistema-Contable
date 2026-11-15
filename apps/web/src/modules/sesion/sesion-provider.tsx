import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { navegar } from "@/app/navegacion";
import { ErrorApi, configurarToken } from "@/lib/api";
import { authSupabase, type AuthCliente } from "./cliente-supabase";
import { SesionContext, type ValorSesion } from "./contexto";
import { errorDeAcceso, lanzarSiHayError } from "./errores";
import { RUTA_CAMBIAR_CONTRASENA } from "./ruta-inicial";
import { usuarioDeSesion } from "./usuario";

const esNoAutorizado = (error: unknown) => error instanceof ErrorApi && error.estado === 401;

/** Si la API rechaza el token (401), la sesión ya no sirve: se cierra para volver a iniciar sesión. */
function alRechazarToken(clienteQuery: QueryClient, cerrar: () => void): () => void {
  const quitarConsultas = clienteQuery.getQueryCache().subscribe((evento) => {
    if (evento.type === "updated" && evento.action.type === "error" && esNoAutorizado(evento.action.error))
      cerrar();
  });
  const quitarMutaciones = clienteQuery.getMutationCache().subscribe((evento) => {
    if (evento.type === "updated" && evento.action.type === "error" && esNoAutorizado(evento.action.error))
      cerrar();
  });
  return () => {
    quitarConsultas();
    quitarMutaciones();
  };
}

/**
 * Sesión del usuario con Supabase Auth (S1-T34, HU-05). Mantiene la sesión al recargar, entrega el token a cada
 * petición de la API y la cierra si la API lo rechaza. Debe usarse dentro de <QueryClientProvider>.
 *
 * `auth` permite pasar un cliente simulado en las pruebas; por defecto usa el de Supabase.
 */
export function SesionProvider({
  auth = authSupabase(),
  children,
}: {
  auth?: AuthCliente | null;
  children: ReactNode;
}) {
  const clienteQuery = useQueryClient();
  // Sin Supabase configurado no hay sesión que esperar
  const [sesion, setSesion] = useState<Session | null | undefined>(auth ? undefined : null);

  useEffect(() => {
    if (!auth) return;
    let vigente = true;
    // El token se pide en cada petición: getSession lo renueva si está por vencer
    configurarToken(async () => (await auth.getSession()).data.session?.access_token);
    void auth.getSession().then(({ data }) => {
      if (vigente) setSesion((actual) => (actual === undefined ? data.session : actual));
    });
    const { data } = auth.onAuthStateChange((evento, nueva) => {
      setSesion(nueva);
      // Los datos en caché eran del usuario anterior
      if (evento === "SIGNED_OUT") clienteQuery.clear();
    });
    const quitar = alRechazarToken(clienteQuery, () => void auth.signOut());
    return () => {
      vigente = false;
      data.subscription.unsubscribe();
      quitar();
      configurarToken(() => null);
    };
  }, [auth, clienteQuery]);

  const valor = useMemo<ValorSesion>(() => {
    const requerirAuth = () => {
      if (!auth) throw errorDeAcceso("sinConfigurar");
      return auth;
    };
    return {
      estado: sesion === undefined ? "cargando" : sesion ? "activa" : "sinSesion",
      usuario: sesion ? usuarioDeSesion(sesion) : null,
      async iniciarSesion(correo, contrasena) {
        const { error } = await requerirAuth().signInWithPassword({ email: correo, password: contrasena });
        lanzarSiHayError(error);
      },
      async cerrarSesion() {
        if (auth) await auth.signOut();
        setSesion(null);
        clienteQuery.clear();
        navegar("/", { reemplazar: true });
      },
      async enviarEnlaceRecuperacion(correo) {
        const { error } = await requerirAuth().resetPasswordForEmail(correo, {
          redirectTo: `${window.location.origin}${RUTA_CAMBIAR_CONTRASENA}`,
        });
        lanzarSiHayError(error);
      },
      async cambiarContrasena(contrasena) {
        const { error } = await requerirAuth().updateUser({ password: contrasena });
        lanzarSiHayError(error);
      },
    };
  }, [auth, sesion, clienteQuery]);

  return <SesionContext value={valor}>{children}</SesionContext>;
}
