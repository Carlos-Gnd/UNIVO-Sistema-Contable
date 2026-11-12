import { useState, type FormEvent } from "react";
import { BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LoginScreenLabels = {
  brand: string;
  eyebrow: string;
  title: string;
  description: string;
  email: string;
  emailPlaceholder: string;
  password: string;
  forgotPassword: string;
  submit: string;
  footer: string;
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
  recoveryHref = "/recuperar-contrasena",
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit?.({ email, password });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpenCheck aria-hidden="true" className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-wide text-foreground">{labels.brand}</span>
        </div>

        <div className="mb-7 space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">{labels.eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{labels.title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{labels.description}</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="login-email">{labels.email}</Label>
            <Input
              autoComplete="email"
              id="login-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder={labels.emailPlaceholder}
              required
              type="email"
              value={email}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="login-password">{labels.password}</Label>
              <a
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={recoveryHref}
              >
                {labels.forgotPassword}
              </a>
            </div>
            <Input
              autoComplete="current-password"
              id="login-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>

          {errorMessage && (
            <p aria-live="polite" className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {labels.submit}
          </Button>
        </form>

        <p className="mt-7 border-t border-border pt-5 text-center text-xs leading-5 text-muted-foreground">
          {labels.footer}
        </p>
      </section>
    </main>
  );
}

export { LoginScreen };
