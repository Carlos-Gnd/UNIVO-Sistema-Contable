import type * as React from "react";
import { navegar } from "@/app/navegacion";

/** Enlace interno: navega sin recargar y respeta Ctrl/Cmd + clic para abrir en otra pestaña. */
function Enlace({ href, onClick, ...props }: React.ComponentProps<"a"> & { href: string }) {
  return (
    <a
      href={href}
      onClick={(evento) => {
        onClick?.(evento);
        if (
          evento.defaultPrevented ||
          evento.button !== 0 ||
          evento.metaKey ||
          evento.ctrlKey ||
          evento.shiftKey ||
          evento.altKey ||
          props.target === "_blank"
        ) {
          return;
        }
        evento.preventDefault();
        navegar(href);
      }}
      {...props}
    />
  );
}

export { Enlace };
