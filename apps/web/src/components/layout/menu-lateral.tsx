import { useMemo } from "react";
import { Calculator } from "lucide-react";
import { cn } from "cn";
import { Enlace } from "@/components/enlace";
import { usePermisos } from "@/modules/organizacion/permisos";
import { gruposVisibles, opcionActiva, type GrupoVisible } from "./opciones-menu";
import { TEXTOS_LAYOUT as T } from "./textos";

/**
 * "fija": la barra lateral de la pantalla; en tableta (768 a 1023 px) se compacta a solo íconos.
 * "panel": el menú deslizable del celular, siempre con los nombres completos.
 */
export type VarianteMenu = "fija" | "panel";

interface MenuLateralProps {
  ruta: string;
  empresaId?: string;
  variante?: VarianteMenu;
  /** Se llama al elegir una opción (por ejemplo, para cerrar el panel en el celular) */
  onNavegar?: () => void;
}

/** Clases que solo aplican a la barra fija en tableta, donde el menú muestra solo íconos (S1-T27). */
const enTableta = (variante: VarianteMenu, clases: string) => (variante === "fija" ? clases : "");

/** Marca del sistema; lleva a la pantalla de la empresa activa. */
function Marca({
  empresaId,
  variante,
  onNavegar,
}: {
  empresaId?: string;
  variante: VarianteMenu;
  onNavegar?: () => void;
}) {
  const contenido = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Calculator className="size-4" aria-hidden />
      </span>
      <span
        className={cn("truncate font-semibold text-foreground", enTableta(variante, "md:max-lg:sr-only"))}
      >
        {T.marca}
      </span>
    </>
  );
  const clases = cn(
    "flex h-16 shrink-0 items-center gap-3 px-4",
    enTableta(variante, "md:max-lg:justify-center md:max-lg:px-0"),
  );
  return empresaId ? (
    <Enlace href={`/empresas/${encodeURIComponent(empresaId)}`} className={clases} onClick={onNavegar}>
      {contenido}
    </Enlace>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

function Aviso({
  children,
  rol,
  variante,
}: {
  children: string;
  rol?: "status" | "alert";
  variante: VarianteMenu;
}) {
  return (
    <p
      role={rol}
      className={cn("px-4 py-2 text-sm text-muted-foreground", enTableta(variante, "md:max-lg:sr-only"))}
    >
      {children}
    </p>
  );
}

function ListaOpciones({
  grupos,
  ruta,
  variante,
  onNavegar,
}: {
  grupos: readonly GrupoVisible[];
  ruta: string;
  variante: VarianteMenu;
  onNavegar?: () => void;
}) {
  const activa = opcionActiva(ruta, grupos);
  return (
    <div className={cn("flex flex-col gap-5 px-3 py-2", enTableta(variante, "md:max-lg:px-2"))}>
      {grupos.map((grupo) => (
        <section key={grupo.id} aria-labelledby={`menu-${variante}-grupo-${grupo.id}`}>
          <h2
            id={`menu-${variante}-grupo-${grupo.id}`}
            className={cn(
              "px-3 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
              enTableta(variante, "md:max-lg:sr-only"),
            )}
          >
            {grupo.titulo}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {grupo.opciones.map((opcion) => {
              const Icono = opcion.icono;
              const esActiva = activa?.id === opcion.id;
              return (
                <li key={opcion.id}>
                  <Enlace
                    href={opcion.href}
                    aria-current={esActiva ? "page" : undefined}
                    // En tableta solo se ve el ícono: el title muestra el nombre al pasar el cursor
                    title={variante === "fija" ? opcion.etiqueta : undefined}
                    onClick={onNavegar}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors outline-none",
                      "hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      variante === "panel" && "h-11 text-base",
                      enTableta(variante, "md:max-lg:size-12 md:max-lg:justify-center md:max-lg:px-0"),
                      esActiva && "bg-secondary font-semibold text-foreground",
                    )}
                  >
                    <Icono
                      className={cn("size-4 shrink-0", enTableta(variante, "md:max-lg:size-5"))}
                      aria-hidden
                    />
                    <span className={cn("truncate", enTableta(variante, "md:max-lg:sr-only"))}>
                      {opcion.etiqueta}
                    </span>
                  </Enlace>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Opciones de la empresa activa según los permisos del usuario. Debe usarse dentro de <PermisosProvider>. */
function OpcionesEmpresa({
  ruta,
  empresaId,
  variante,
  onNavegar,
}: Required<Pick<MenuLateralProps, "ruta" | "empresaId" | "variante">> &
  Pick<MenuLateralProps, "onNavegar">) {
  const { estado, permisos } = usePermisos();
  const grupos = useMemo(() => gruposVisibles(empresaId, { permisos }), [empresaId, permisos]);

  if (estado === "cargando")
    return (
      <Aviso rol="status" variante={variante}>
        {T.menu.cargando}
      </Aviso>
    );
  if (estado === "error")
    return (
      <Aviso rol="alert" variante={variante}>
        {T.menu.error}
      </Aviso>
    );
  if (grupos.length === 0) return <Aviso variante={variante}>{T.menu.sinOpciones}</Aviso>;
  return <ListaOpciones grupos={grupos} ruta={ruta} variante={variante} onNavegar={onNavegar} />;
}

/** Contenido del menú lateral: marca y opciones agrupadas por módulo (S1-T26, S1-T27). */
export function MenuLateral({ ruta, empresaId, variante = "fija", onNavegar }: MenuLateralProps) {
  return (
    <nav aria-label={T.menu.etiqueta} className="flex h-full flex-col">
      <Marca empresaId={empresaId} variante={variante} onNavegar={onNavegar} />
      <div className="flex-1 overflow-y-auto pb-6">
        {empresaId ? (
          <OpcionesEmpresa ruta={ruta} empresaId={empresaId} variante={variante} onNavegar={onNavegar} />
        ) : (
          <Aviso variante={variante}>{T.menu.sinEmpresa}</Aviso>
        )}
      </div>
    </nav>
  );
}
