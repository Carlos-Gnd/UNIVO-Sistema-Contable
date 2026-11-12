import { Toaster } from "@/components/ui/sonner";
import { LoginScreen } from "@/components/auth/login-screen";

const loginLabels = {
  brand: "Sistema Contable UNIVO",
  eyebrow: "Acceso seguro",
  title: "Iniciar sesión",
  description: "Ingresa tus datos para acceder a tu espacio de trabajo.",
  email: "Correo electrónico",
  emailPlaceholder: "nombre@empresa.com",
  password: "Contraseña",
  forgotPassword: "¿Olvidaste tu contraseña?",
  submit: "Continuar",
  footer: "Acceso para usuarios autorizados del sistema contable.",
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
