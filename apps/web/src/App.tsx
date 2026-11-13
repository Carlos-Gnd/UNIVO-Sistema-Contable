import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useRutaActual } from "@/app/navegacion";
import { resolverRuta, RUTAS } from "@/app/rutas";
import { LoginScreen } from "@/components/auth/login-screen";
import { PasswordRecoveryScreen } from "@/components/auth/password-recovery-screen";
import { PasswordResetScreen } from "@/components/auth/password-reset-screen";
import { Toaster } from "@/components/ui/sonner";
import { crearClienteQuery } from "@/lib/query";
import { PermisosProvider } from "@/modules/organizacion/permisos";

const loginLabels = {
  brand: "Sistema Contable",
  tagline: "Tu contabilidad, clara y al centavo.",
  supportingText:
    "Partidas, libros, IVA y estados financieros de todas tus empresas y sucursales en un mismo lugar.",
  contextLine: "Multiempresa · Multisucursal · US$ · dd/mm/aaaa",
  title: "Inicia sesión",
  description: "Ingresa tu correo y contraseña para continuar.",
  email: "Correo electrónico",
  emailPlaceholder: "Ej: chero@gmail.com",
  emailRequired: "Escribe tu correo.",
  emailMissingAt: "Falta la @. Escríbelo así: chero@gmail.com",
  emailMissingEnding: "Al dominio le falta la terminación, como .com o .sv",
  emailInvalid: "Escribe un correo válido.",
  password: "Contraseña",
  passwordPlaceholder: "Escribe tu contraseña",
  passwordRequired: "Escribe tu contraseña.",
  forgotPassword: "¿Olvidaste tu contraseña?",
  showPassword: "Mostrar contraseña",
  hidePassword: "Ocultar contraseña",
  submit: "Entrar",
  submitting: "Entrando…",
  submitError: "No se pudo iniciar sesión. Inténtalo de nuevo.",
};

const passwordRecoveryLabels = {
  brand: loginLabels.brand,
  tagline: loginLabels.tagline,
  supportingText: loginLabels.supportingText,
  contextLine: loginLabels.contextLine,
  backToLogin: "Volver a iniciar sesión",
  title: "Recupera tu contraseña",
  description: "Te enviaremos un enlace para crear una nueva.",
  email: loginLabels.email,
  emailPlaceholder: loginLabels.emailPlaceholder,
  emailRequired: loginLabels.emailRequired,
  emailMissingAt: loginLabels.emailMissingAt,
  emailMissingEnding: loginLabels.emailMissingEnding,
  emailInvalid: loginLabels.emailInvalid,
  submit: "Enviar enlace",
  submitting: "Enviando…",
  submitError: "No se pudo enviar el enlace. Inténtalo de nuevo.",
  confirmationTitle: "Revisa tu correo",
  confirmationPrefix: "Si",
  confirmationSuffix: "tiene una cuenta, recibirás el enlace en unos minutos. Vence en una hora.",
  resend: "Reenviar",
  resending: "Reenviando…",
  resentNotification: "Enlace reenviado",
};

const passwordResetLabels = {
  brand: loginLabels.brand,
  tagline: loginLabels.tagline,
  supportingText: loginLabels.supportingText,
  contextLine: loginLabels.contextLine,
  backToLogin: "Volver a iniciar sesión",
  title: "Crea una contraseña nueva",
  description: "Al menos 8 caracteres.",
  password: "Nueva contraseña",
  passwordPlaceholder: "Escribe tu nueva contraseña",
  passwordRequired: "Escribe tu contraseña.",
  passwordTooShort: "Faltan caracteres: mínimo 8.",
  confirmPassword: "Repite la contraseña",
  confirmPasswordPlaceholder: "Escríbela otra vez",
  confirmPasswordRequired: "Confirma tu contraseña.",
  passwordsDontMatch: "Las contraseñas no coinciden.",
  submit: "Guardar contraseña",
  submitting: "Guardando…",
  submitError: "No se pudo actualizar la contraseña. Inténtalo de nuevo.",
  successNotification: "Contraseña actualizada",
};

/** Pantalla de un módulo; las rutas con :empresaId cargan los permisos del usuario en esa empresa. */
function PantallaModulo({ ruta }: { ruta: string }) {
  const resuelta = resolverRuta(ruta, RUTAS);
  if (!resuelta) return null;
  const { definicion, parametros } = resuelta;
  const Componente = definicion.componente;
  const pantalla = <Componente parametros={parametros} />;
  return (
    <main className="pantalla-modulo flex-1">
      {parametros.empresaId ? (
        <PermisosProvider key={parametros.empresaId} empresaId={parametros.empresaId}>
          {pantalla}
        </PermisosProvider>
      ) : (
        pantalla
      )}
    </main>
  );
}

export function App() {
  const [clienteQuery] = useState(crearClienteQuery);
  const path = useRutaActual();

  const screen = resolverRuta(path, RUTAS) ? (
    <PantallaModulo ruta={path} />
  ) : path === "/recuperar" ? (
    <PasswordRecoveryScreen labels={passwordRecoveryLabels} />
  ) : path === "/cambiar-contrasena" ? (
    <PasswordResetScreen labels={passwordResetLabels} />
  ) : (
    <LoginScreen labels={loginLabels} />
  );

  return (
    <QueryClientProvider client={clienteQuery}>
      <div className="app-shell">
        {screen}
        <footer className="app-footer">v{__APP_VERSION__}</footer>
        <Toaster theme="dark" />
      </div>
    </QueryClientProvider>
  );
}
