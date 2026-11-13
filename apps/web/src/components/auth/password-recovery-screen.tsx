import { useState, type FormEvent } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import type { AuthBranding } from "@/components/auth/auth-layout";
import { AuthLayout } from "@/components/auth/auth-layout";
import { validateEmail } from "@/components/auth/email-validation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type PasswordRecoveryLabels = AuthBranding & {
  backToLogin: string;
  title: string;
  description: string;
  email: string;
  emailPlaceholder: string;
  emailRequired: string;
  emailMissingAt: string;
  emailMissingEnding: string;
  emailInvalid: string;
  submit: string;
  submitting: string;
  submitError: string;
  successMessage: string;
};

type PasswordRecoveryScreenProps = {
  labels: PasswordRecoveryLabels;
  loginHref?: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  onSubmit?: (input: { email: string }) => void | Promise<void>;
};

function PasswordRecoveryScreen({
  labels,
  loginHref = "/",
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: PasswordRecoveryScreenProps) {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [sent, setSent] = useState(false);

  const emailMessages = {
    required: labels.emailRequired,
    missingAt: labels.emailMissingAt,
    missingEnding: labels.emailMissingEnding,
    invalid: labels.emailInvalid,
  };
  const emailError = emailTouched || submitAttempted ? validateEmail(email, emailMessages) : undefined;
  const submitting = isSubmitting || localSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setEmailTouched(true);
    setSubmitError(undefined);
    setSent(false);

    if (validateEmail(email, emailMessages) || !onSubmit) return;

    setLocalSubmitting(true);
    try {
      await onSubmit({ email: email.trim() });
      setSent(true);
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
          <h2 className="text-4xl font-medium tracking-tight text-foreground sm:text-5xl">{labels.title}</h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">{labels.description}</p>
        </div>

        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          <Field data-invalid={Boolean(emailError)}>
            <FieldLabel htmlFor="recovery-email">{labels.email}</FieldLabel>
            <Input
              aria-describedby={emailError ? "recovery-email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              autoFocus
              className="h-12 rounded-xl px-4 text-base"
              id="recovery-email"
              name="email"
              onBlur={() => setEmailTouched(true)}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={labels.emailPlaceholder}
              type="email"
              value={email}
            />
            {emailError && <FieldError id="recovery-email-error">{emailError}</FieldError>}
          </Field>

          {(submitError ?? errorMessage) && (
            <p aria-live="polite" className="text-sm text-destructive" role="alert">
              {submitError ?? errorMessage}
            </p>
          )}
          {sent && (
            <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
              {labels.successMessage}
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

export { PasswordRecoveryScreen };
