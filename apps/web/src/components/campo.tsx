import type { ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

export interface PropsControl {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

interface CampoProps {
  id: string;
  etiqueta: ReactNode;
  /** Texto de ayuda bajo el control; se oculta mientras hay un error */
  ayuda?: ReactNode;
  error?: string;
  className?: string;
  /** Recibe id y los atributos aria para enlazar el control con su etiqueta, ayuda y error */
  children: (props: PropsControl) => ReactNode;
}

/** Campo de formulario accesible: etiqueta, control, ayuda y mensaje de error enlazados por id. */
export function Campo({ id, etiqueta, ayuda, error, className, children }: CampoProps) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  return (
    <Field data-invalid={Boolean(error)} className={className}>
      <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? idError : ayuda ? idAyuda : undefined,
      })}
      {error ? (
        <FieldError id={idError}>{error}</FieldError>
      ) : (
        ayuda && <FieldDescription id={idAyuda}>{ayuda}</FieldDescription>
      )}
    </Field>
  );
}
