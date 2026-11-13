import { Toaster } from "@/components/ui/sonner";
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

export function App() {
  return (
    <div className="app-shell">
      <LoginScreen labels={loginLabels} />
      <footer className="app-footer">v{__APP_VERSION__}</footer>
      <Toaster theme="dark" />
    </div>
  );
}
