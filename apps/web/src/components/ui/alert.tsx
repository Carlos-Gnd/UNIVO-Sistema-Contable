import type * as React from "react";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "cn";

/** Aviso dentro de la pantalla: informativo (nota) o de error (alerta, lo anuncian los lectores de pantalla). */
function Alert({
  variant = "info",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { variant?: "info" | "error" }) {
  const error = variant === "error";
  return (
    <div
      data-slot="alert"
      role={error ? "alert" : "note"}
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm",
        error
          ? "border-destructive/40 bg-[var(--destructive-background)] text-destructive"
          : "border-border bg-secondary text-muted-foreground",
        className,
      )}
      {...props}
    >
      {error ? (
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export { Alert };
