import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
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

function validateEmail(email: string, labels: LoginScreenLabels) {
  const value = email.trim();

  if (!value) return labels.emailRequired;

  const atIndex = value.indexOf("@");
  if (atIndex < 0) return labels.emailMissingAt;
  if (atIndex === 0 || atIndex !== value.lastIndexOf("@")) return labels.emailInvalid;

  const domain = value.slice(atIndex + 1);
  if (!domain.includes(".") || domain.endsWith(".")) return labels.emailMissingEnding;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return labels.emailInvalid;

  return undefined;
}

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

  const emailError = emailTouched || submitAttempted ? validateEmail(email, labels) : undefined;
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

    if (validateEmail(email, labels) || password.length === 0 || !onSubmit) return;

    setLocalSubmitting(true);
    try {
      await onSubmit({ email: email.trim(), password });
    } catch {
      setSubmitError(labels.submitError);
    } finally {
      setLocalSubmitting(false);
    }
  }

  return (
    <main className="grid flex-1 p-0 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <aside className="hidden flex-col justify-between border-r border-sidebar-border bg-sidebar px-10 py-9 text-sidebar-foreground lg:flex xl:px-14 2xl:px-20">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-[4.5rem] place-items-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground"
          >
            SC
          </span>
          <span className="text-xl font-semibold tracking-tight">{labels.brand}</span>
        </div>

        <div className="max-w-2xl space-y-6 py-12">
          <h1 className="text-5xl leading-[1.12] font-medium tracking-tight xl:text-6xl">{labels.tagline}</h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground xl:text-xl">
            {labels.supportingText}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">{labels.contextLine}</p>
      </aside>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
        <div className="w-full max-w-[520px] space-y-9">
          <div className="space-y-3">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground"
              >
                SC
              </span>
              <span className="font-semibold text-foreground">{labels.brand}</span>
            </div>
            <h2 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
              {labels.title}
            </h2>
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
      </section>
    </main>
  );
}

export { LoginScreen };
