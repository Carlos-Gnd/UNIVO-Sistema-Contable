import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

/** Etiqueta de estado (propuesta de diseño): borrador, contabilizada, descuadrada, abierto, cerrado… */
const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        solida: "bg-primary text-primary-foreground",
        neutra: "bg-secondary text-muted-foreground",
        contorno: "border border-input text-foreground",
        discontinua: "border border-dashed border-muted-foreground text-muted-foreground",
        alerta: "bg-[var(--destructive-background)] text-destructive",
        tachada: "bg-secondary text-muted-foreground line-through",
      },
    },
    defaultVariants: { variant: "neutra" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
