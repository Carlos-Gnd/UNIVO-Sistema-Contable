import { Suspense, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { navegar, useRutaActual } from "@/app/navegacion";
import { resolverRuta, RUTAS } from "@/app/rutas";
import {
  useEtiquetasCambioContrasena,
  useEtiquetasLogin,
  useEtiquetasRecuperacion,
} from "@/components/auth/etiquetas";
import { LoginScreen } from "@/components/auth/login-screen";
import { PasswordRecoveryScreen } from "@/components/auth/password-recovery-screen";
import { PasswordResetScreen } from "@/components/auth/password-reset-screen";
import { LayoutPrincipal } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";
import { crearClienteQuery } from "@/lib/query";
import { PermisosProvider } from "@/modules/organizacion/permisos";
import {
  RUTA_CAMBIAR_CONTRASENA,
  SesionProvider,
  recordarRuta,
  rutaInicial,
  useSesion,
  type AuthCliente,
} from "@/modules/sesion";

/** Pantalla de un módulo; las rutas con :empresaId cargan los permisos del usuario en esa empresa. */
function PantallaModulo({ ruta }: { ruta: string }) {
  const { t } = useTranslation();
  const resuelta = resolverRuta(ruta, RUTAS);
  if (!resuelta) return null;
  const { definicion, parametros } = resuelta;
  const Componente = definicion.componente;
  // Cada módulo puede cargar su pantalla con lazy(): se descarga solo al abrir su ruta
  const pantalla = (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-muted-foreground">
          {t("cargando")}
        </p>
      }
    >
      <Componente parametros={parametros} />
    </Suspense>
  );
  const contenido = (
    <LayoutPrincipal ruta={ruta} empresaId={parametros.empresaId}>
      {pantalla}
    </LayoutPrincipal>
  );
  // El proveedor envuelve todo el layout: el menú también oculta las opciones sin permiso
  return parametros.empresaId ? (
    <PermisosProvider key={parametros.empresaId} empresaId={parametros.empresaId}>
      {contenido}
    </PermisosProvider>
  ) : (
    contenido
  );
}

/** Lleva a otra ruta al montarse, sin dejar la actual en el historial. */
function Redirigir({ a }: { a: string }) {
  useEffect(() => navegar(a, { reemplazar: true }), [a]);
  return null;
}

/** Elige la pantalla según la ruta y la sesión: las pantallas del sistema piden iniciar sesión (S1-T34). */
function Pantallas() {
  const { t } = useTranslation();
  const etiquetasLogin = useEtiquetasLogin();
  const etiquetasRecuperacion = useEtiquetasRecuperacion();
  const etiquetasCambio = useEtiquetasCambioContrasena();
  const sesion = useSesion();
  const path = useRutaActual();
  const usuarioId = sesion.usuario?.id;

  const esModulo = resolverRuta(path, RUTAS) !== null;
  const enModulo = esModulo && usuarioId !== undefined;

  useEffect(() => {
    if (enModulo) recordarRuta(usuarioId, path);
  }, [enModulo, usuarioId, path]);

  const screen =
    sesion.estado === "cargando" ? (
      <main className="grid flex-1 place-items-center">
        <p role="status" className="text-muted-foreground">
          {t("cargando")}
        </p>
      </main>
    ) : path === "/recuperar" ? (
      <PasswordRecoveryScreen
        labels={etiquetasRecuperacion}
        onSubmit={({ email }) => sesion.enviarEnlaceRecuperacion(email)}
      />
    ) : path === RUTA_CAMBIAR_CONTRASENA ? (
      <PasswordResetScreen
        labels={etiquetasCambio}
        onSubmit={({ password }) => sesion.cambiarContrasena(password)}
      />
    ) : !usuarioId ? (
      // Sin sesión, cualquier pantalla del sistema muestra el inicio de sesión en su misma ruta:
      // al entrar, se abre la pantalla que el usuario pidió
      <LoginScreen
        labels={etiquetasLogin}
        onSubmit={({ email, password }) => sesion.iniciarSesion(email, password)}
      />
    ) : esModulo ? (
      <PantallaModulo ruta={path} />
    ) : (
      <Redirigir a={rutaInicial(usuarioId)} />
    );

  return (
    <div className="app-shell">
      {screen}
      {/* Las pantallas de los módulos muestran la versión en el pie del layout principal */}
      {!enModulo && <footer className="app-footer">{t("version", { version: __APP_VERSION__ })}</footer>}
      <Toaster theme="dark" />
    </div>
  );
}

/** `auth` permite usar un Supabase Auth simulado en las pruebas; por defecto, el real. */
export function App({ auth }: { auth?: AuthCliente | null }) {
  const [clienteQuery] = useState(crearClienteQuery);
  return (
    <QueryClientProvider client={clienteQuery}>
      <SesionProvider auth={auth}>
        <Pantallas />
      </SesionProvider>
    </QueryClientProvider>
  );
}
