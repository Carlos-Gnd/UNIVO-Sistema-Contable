import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { mensajeDeAcceso } from "@/components/auth/error-acceso";
import { validateEmail } from "@/components/auth/email-validation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type LoginScreenLabels = {
  brand: string;
  tagline: string;
  supportingText: string;
  contextLine: string;
  title: string;
  description: string;
  email: string;
  emailPlaceholder: string;
  emailRequired: string;
  emailMissingAt: string;
  emailMissingEnding: string;
  emailInvalid: string;
  password: string;
  passwordPlaceholder: string;
  passwordRequired: string;
  forgotPassword: string;
  showPassword: string;
  hidePassword: string;
  submit: string;
  submitting: string;
  submitError: string;
};

type LoginScreenProps = {
  labels: LoginScreenLabels;
  recoveryHref?: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onSubmit?: (credentials: { email: string; password: string }) => void | Promise<void>;
};

function LoginScreen({
  labels,
  recoveryHref = "/recuperar",
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const emailMessages = {
    required: labels.emailRequired,
    missingAt: labels.emailMissingAt,
    missingEnding: labels.emailMissingEnding,
    invalid: labels.emailInvalid,
  };
  const emailError = emailTouched || submitAttempted ? validateEmail(email, emailMessages) : undefined;
  const passwordError =
    passwordTouched || submitAttempted
      ? password.length === 0
        ? labels.passwordRequired
        : undefined
      : undefined;
  const submitting = isSubmitting || localSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setEmailTouched(true);
    setPasswordTouched(true);
    setSubmitError(undefined);

    if (validateEmail(email, emailMessages) || password.length === 0 || !onSubmit) return;

    setLocalSubmitting(true);
    try {
      await onSubmit({ email: email.trim(), password });
    } catch (error) {
      setSubmitError(mensajeDeAcceso(error, labels.submitError));
    } finally {
      setLocalSubmitting(false);
    }
  }

  return (
    <AuthLayout branding={labels}>
      <div className="space-y-9">
        <div className="space-y-3">
          <h1 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl">{labels.title}</h1>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">{labels.description}</p>
        </div>

        <form className="space-y-7" noValidate onSubmit={handleSubmit}>
          <Field data-invalid={Boolean(emailError)}>
            <FieldLabel htmlFor="login-email">{labels.email}</FieldLabel>
            <Input
              aria-describedby={emailError ? "login-email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              autoFocus
              className="h-12 rounded-xl px-4 text-base"
              id="login-email"
              name="email"
              onBlur={() => setEmailTouched(true)}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={labels.emailPlaceholder}
              type="email"
              value={email}
            />
            {emailError && <FieldError id="login-email-error">{emailError}</FieldError>}
          </Field>

          <Field data-invalid={Boolean(passwordError)}>
            <FieldLabel htmlFor="login-password">{labels.password}</FieldLabel>
            <div className="relative">
              <Input
                aria-describedby={passwordError ? "login-password-error" : undefined}
                aria-invalid={Boolean(passwordError)}
                autoComplete="current-password"
                className="h-12 rounded-xl px-4 pr-12 text-base"
                id="login-password"
                name="password"
                onBlur={() => setPasswordTouched(true)}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={labels.passwordPlaceholder}
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <Button
                aria-label={showPassword ? labels.hidePassword : labels.showPassword}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword((current) => !current)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
            {passwordError && <FieldError id="login-password-error">{passwordError}</FieldError>}
          </Field>

          <div className="flex justify-end">
            <a
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={recoveryHref}
            >
              {labels.forgotPassword}
            </a>
          </div>

          {(submitError ?? errorMessage) && (
            <p aria-live="polite" className="text-sm text-destructive" role="alert">
              {submitError ?? errorMessage}
            </p>
          )}

          <Button className="h-12 w-full rounded-full text-base" disabled={submitting} type="submit">
            {submitting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {submitting ? labels.submitting : labels.submit}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}

export { LoginScreen };
