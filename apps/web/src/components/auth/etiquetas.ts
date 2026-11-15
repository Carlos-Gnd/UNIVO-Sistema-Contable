import { useTranslation } from "react-i18next";
import type { AuthBranding } from "./auth-layout";
import type { LoginScreenLabels } from "./login-screen";
import type { PasswordRecoveryLabels } from "./password-recovery-screen";
import type { PasswordResetLabels } from "./password-reset-screen";

/** Textos comunes a las pantallas de acceso: marca y validación del correo. */
function useComunes() {
  const { t } = useTranslation("auth");
  const { t: tComun } = useTranslation("comun");
  const marca: AuthBranding = {
    brand: tComun("marca"),
    tagline: t("marca.lema"),
    supportingText: t("marca.apoyo"),
    contextLine: t("marca.contexto"),
  };
  const correo = {
    email: t("correo.etiqueta"),
    emailPlaceholder: t("correo.ejemplo"),
    emailRequired: t("correo.requerido"),
    emailMissingAt: t("correo.faltaArroba"),
    emailMissingEnding: t("correo.faltaTerminacion"),
    emailInvalid: t("correo.invalido"),
  };
  return { t, marca, correo };
}

/** Textos de la pantalla de inicio de sesión en el idioma actual (S1-T30). */
export function useEtiquetasLogin(): LoginScreenLabels {
  const { t, marca, correo } = useComunes();
  return {
    ...marca,
    ...correo,
    title: t("login.titulo"),
    description: t("login.descripcion"),
    password: t("login.contrasena"),
    passwordPlaceholder: t("login.contrasenaEjemplo"),
    passwordRequired: t("contrasena.requerida"),
    forgotPassword: t("login.olvido"),
    showPassword: t("login.mostrar"),
    hidePassword: t("login.ocultar"),
    submit: t("login.enviar"),
    submitting: t("login.enviando"),
    submitError: t("login.error"),
  };
}

/** Textos de la pantalla de recuperación de contraseña en el idioma actual (S1-T30). */
export function useEtiquetasRecuperacion(): PasswordRecoveryLabels {
  const { t, marca, correo } = useComunes();
  return {
    ...marca,
    ...correo,
    backToLogin: t("volverAlInicio"),
    title: t("recuperar.titulo"),
    description: t("recuperar.descripcion"),
    submit: t("recuperar.enviar"),
    submitting: t("recuperar.enviando"),
    submitError: t("recuperar.error"),
    confirmationTitle: t("recuperar.confirmacionTitulo"),
    confirmationPrefix: t("recuperar.confirmacionAntes"),
    confirmationSuffix: t("recuperar.confirmacionDespues"),
    resend: t("recuperar.reenviar"),
    resending: t("recuperar.reenviando"),
    resentNotification: t("recuperar.reenviado"),
  };
}

/** Textos de la pantalla para crear una contraseña nueva en el idioma actual (S1-T30). */
export function useEtiquetasCambioContrasena(): PasswordResetLabels {
  const { t, marca } = useComunes();
  return {
    ...marca,
    backToLogin: t("volverAlInicio"),
    title: t("cambiar.titulo"),
    description: t("cambiar.descripcion"),
    password: t("cambiar.contrasena"),
    passwordPlaceholder: t("cambiar.contrasenaEjemplo"),
    passwordRequired: t("contrasena.requerida"),
    passwordTooShort: t("cambiar.muyCorta"),
    confirmPassword: t("cambiar.confirmar"),
    confirmPasswordPlaceholder: t("cambiar.confirmarEjemplo"),
    confirmPasswordRequired: t("cambiar.confirmarRequerida"),
    passwordsDontMatch: t("cambiar.noCoinciden"),
    submit: t("cambiar.enviar"),
    submitting: t("cambiar.enviando"),
    submitError: t("cambiar.error"),
    successNotification: t("cambiar.exito"),
  };
}
