import { useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { AuthBranding } from "@/components/auth/auth-layout";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type PasswordResetLabels = AuthBranding & {
  backToLogin: string;
  title: string;
  description: string;
  password: string;
  passwordPlaceholder: string;
  passwordRequired: string;
  passwordTooShort: string;
  confirmPassword: string;
  confirmPasswordPlaceholder: string;
  confirmPasswordRequired: string;
  passwordsDontMatch: string;
  submit: string;
  submitting: string;
  submitError: string;
  successNotification: string;
};

type PasswordResetScreenProps = {
  labels: PasswordResetLabels;
  loginHref?: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onSubmit?: (input: { password: string }) => void | Promise<void>;
};

function PasswordResetScreen({
  labels,
  loginHref = "/",
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: PasswordResetScreenProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const showPasswordError = passwordTouched || submitAttempted;
  const passwordError = showPasswordError
    ? password.length === 0
      ? labels.passwordRequired
      : password.length < 8
        ? labels.passwordTooShort
        : undefined
    : undefined;
  const showConfirmPasswordError = confirmPasswordTouched || submitAttempted;
  const confirmPasswordError = showConfirmPasswordError
    ? confirmPassword.length === 0
      ? labels.confirmPasswordRequired
      : password !== confirmPassword
        ? labels.passwordsDontMatch
        : undefined
    : undefined;
  const submitting = isSubmitting || localSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setPasswordTouched(true);
    setConfirmPasswordTouched(true);
    setSubmitError(undefined);
    if (password.length < 8 || confirmPassword.length === 0 || password !== confirmPassword || !onSubmit) {
      return;
    }

    setLocalSubmitting(true);
    try {
      await onSubmit({ password });
      toast.success(labels.successNotification);
      window.history.pushState({}, "", loginHref);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      setSubmitError(labels.submitError);
    } finally {
      setLocalSubmitting(false);
    }
  }

  return (
    <AuthLayout branding={labels}>
      <div className="space-y-8">
        <a
          className="inline-flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={loginHref}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {labels.backToLogin}
        </a>

        <div className="space-y-3">
          <h1 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl">{labels.title}</h1>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">{labels.description}</p>
        </div>

        <form className="space-y-6" noValidate onSubmit={handleSubmit}>
          <Field data-invalid={Boolean(passwordError)}>
            <FieldLabel htmlFor="new-password">{labels.password}</FieldLabel>
            <Input
              aria-describedby={passwordError ? "new-password-error" : undefined}
              aria-invalid={Boolean(passwordError)}
              autoComplete="new-password"
              autoFocus
              className="h-12 rounded-xl px-4 text-base"
              id="new-password"
              minLength={8}
              name="password"
              onBlur={() => setPasswordTouched(true)}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={labels.passwordPlaceholder}
              type="password"
              value={password}
            />
            {passwordError && <FieldError id="new-password-error">{passwordError}</FieldError>}
          </Field>

          <Field data-invalid={Boolean(confirmPasswordError)}>
            <FieldLabel htmlFor="confirm-password">{labels.confirmPassword}</FieldLabel>
            <Input
              aria-describedby={confirmPasswordError ? "confirm-password-error" : undefined}
              aria-invalid={Boolean(confirmPasswordError)}
              autoComplete="new-password"
              className="h-12 rounded-xl px-4 text-base"
              id="confirm-password"
              name="confirmPassword"
              onBlur={() => setConfirmPasswordTouched(true)}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={labels.confirmPasswordPlaceholder}
              type="password"
              value={confirmPassword}
            />
            {confirmPasswordError && (
              <FieldError id="confirm-password-error">{confirmPasswordError}</FieldError>
            )}
          </Field>

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

export { PasswordResetScreen };
