import type { ReactNode } from "react";
import { cn } from "cn";

/** Contenedor de una pantalla del sistema: ancho máximo, márgenes y separación vertical. */
function Pagina({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 pt-6 pb-24 sm:px-6 sm:pt-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Título de la pantalla con su descripción y las acciones principales a la derecha. */
function EncabezadoPagina({
  titulo,
  descripcion,
  children,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-normal tracking-tight sm:text-[32px]">{titulo}</h1>
        {descripcion && <p className="mt-1 text-muted-foreground">{descripcion}</p>}
      </div>
      {children && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {children}
        </div>
      )}
    </div>
  );
}

export { Pagina, EncabezadoPagina };
