import { Toaster } from "@/components/ui/sonner";
import { PasswordRecoveryScreen } from "@/components/auth/password-recovery-screen";
import { PasswordResetScreen } from "@/components/auth/password-reset-screen";
import { LoginScreen } from "@/components/auth/login-screen";

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
  successMessage: "Si el correo está registrado, te enviaremos un enlace para restablecer tu contraseña.",
};

const passwordResetLabels = {
  brand: loginLabels.brand,
  tagline: loginLabels.tagline,
  supportingText: loginLabels.supportingText,
  contextLine: loginLabels.contextLine,
  backToLogin: "Volver a iniciar sesión",
  title: "Crea una nueva contraseña",
  description: "Elige una contraseña nueva para acceder a tu cuenta.",
  password: "Nueva contraseña",
  passwordPlaceholder: "Escribe tu nueva contraseña",
  passwordRequired: "Escribe tu contraseña.",
  confirmPassword: "Confirmar contraseña",
  confirmPasswordPlaceholder: "Escribe de nuevo tu contraseña",
  confirmPasswordRequired: "Confirma tu contraseña.",
  passwordsDontMatch: "Las contraseñas no coinciden.",
  submit: "Guardar contraseña",
  submitting: "Guardando…",
  submitError: "No se pudo actualizar la contraseña. Inténtalo de nuevo.",
  successMessage: "Tu contraseña se actualizó. Ya puedes iniciar sesión.",
};

export function App() {
  const path = window.location.pathname;
  const screen =
    path === "/recuperar" ? (
      <PasswordRecoveryScreen labels={passwordRecoveryLabels} />
    ) : path === "/cambiar-contrasena" ? (
      <PasswordResetScreen labels={passwordResetLabels} />
    ) : (
      <LoginScreen labels={loginLabels} />
    );

  return (
    <div className="app-shell">
      {screen}
      <footer className="app-footer">v{__APP_VERSION__}</footer>
      <Toaster theme="dark" />
    </div>
  );
}
