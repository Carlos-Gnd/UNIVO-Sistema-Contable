import { Suspense, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRutaActual } from "@/app/navegacion";
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

export function App() {
  const [clienteQuery] = useState(crearClienteQuery);
  const { t } = useTranslation();
  const etiquetasLogin = useEtiquetasLogin();
  const etiquetasRecuperacion = useEtiquetasRecuperacion();
  const etiquetasCambio = useEtiquetasCambioContrasena();
  const path = useRutaActual();

  const esModulo = resolverRuta(path, RUTAS) !== null;
  const screen = esModulo ? (
    <PantallaModulo ruta={path} />
  ) : path === "/recuperar" ? (
    <PasswordRecoveryScreen labels={etiquetasRecuperacion} />
  ) : path === "/cambiar-contrasena" ? (
    <PasswordResetScreen labels={etiquetasCambio} />
  ) : (
    <LoginScreen labels={etiquetasLogin} />
  );

  return (
    <QueryClientProvider client={clienteQuery}>
      <div className="app-shell">
        {screen}
        {/* Las pantallas de los módulos muestran la versión en el pie del layout principal */}
        {!esModulo && <footer className="app-footer">{t("version", { version: __APP_VERSION__ })}</footer>}
        <Toaster theme="dark" />
      </div>
    </QueryClientProvider>
  );
}
