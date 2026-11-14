import { useEffect, useRef } from "react";
import type * as React from "react";
import { cn } from "cn";

/** Casilla nativa con soporte del estado intermedio (por ejemplo, «seleccionar todas» con selección parcial). */
function Checkbox({
  className,
  indeterminate = false,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-[18px] shrink-0 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
