import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "cn";
import { toast } from "sonner";
import { navegar } from "@/app/navegacion";
import type { CodigoPermiso } from "@/modules/organizacion/permisos";
import { usePermisos } from "@/modules/organizacion/permisos";
import { esMac } from "./atajos";
import { FilaCuenta } from "./cuenta";
import { gruposVisibles, type IdOpcion, type OpcionVisible } from "./opciones-menu";
import { useTranslation } from "react-i18next";

interface MenuPrincipalProps {
  /** Opción de la pantalla actual, que se resalta en el menú */
  idActiva?: IdOpcion;
  empresaId?: string;
  /** Cierra el menú al elegir una pantalla */
  onNavegar: () => void;
}

/** Tecla dibujada como en el teclado, para la ayuda del menú. */
function Tecla({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded-md border border-input bg-background px-1 font-sans text-[11px] text-muted-foreground">
      {children}
    </kbd>
  );
}

function Aviso({ children, rol }: { children: string; rol?: "status" | "alert" }) {
  return (
    <p role={rol} className="p-6 text-center text-muted-foreground">
      {children}
    </p>
  );
}

/** Buscador y lista de pantallas; con las flechas se mueve la selección y con Enter se abre. */
function ListaPantallas({
  empresaId,
  permisos,
  idActiva,
  onNavegar,
}: {
  empresaId: string;
  permisos: ReadonlySet<CodigoPermiso>;
  idActiva?: IdOpcion;
  onNavegar: () => void;
}) {
  const { t } = useTranslation("layout");
  const id = useId();
  const [busqueda, setBusqueda] = useState("");
  const [foco, setFoco] = useState(0);
  const grupos = useMemo(
    () => gruposVisibles(empresaId, { permisos, busqueda, t }),
    [empresaId, permisos, busqueda, t],
  );
  const opciones = grupos.flatMap((g) => g.opciones);
  const enFoco = Math.min(foco, opciones.length - 1);
  const idOpcion = (indice: number) => `${id}-opcion-${indice}`;

  function mover(indice: number) {
    setFoco(indice);
    document.getElementById(idOpcion(indice))?.scrollIntoView({ block: "nearest" });
  }

  function elegir(opcion: OpcionVisible) {
    if (opcion.href) {
      navegar(opcion.href);
      onNavegar();
    } else {
      const pantalla = opcion.etiqueta;
      toast(
        opcion.sprint > 1
          ? t("menu.llegaEnSprint", { pantalla, sprint: opcion.sprint })
          : t("menu.enConstruccion", { pantalla }),
      );
    }
  }

  function alPresionar(evento: KeyboardEvent<HTMLInputElement>) {
    if (opciones.length === 0) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      mover((enFoco + 1) % opciones.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      mover((enFoco - 1 + opciones.length) % opciones.length);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      const opcion = opciones[enFoco];
      if (opcion) elegir(opcion);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border p-4 pb-3">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            role="combobox"
            autoComplete="off"
            value={busqueda}
            onChange={(evento) => {
              setBusqueda(evento.target.value);
              setFoco(0);
            }}
            onKeyDown={alPresionar}
            placeholder={t("menu.buscar")}
            aria-label={t("menu.buscarEtiqueta")}
            aria-expanded
            aria-controls={`${id}-lista`}
            aria-activedescendant={opciones[enFoco] ? idOpcion(enFoco) : undefined}
            className="h-10 w-full rounded-full border border-input bg-background pr-3.5 pl-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-muted-foreground"
          />
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Tecla>Esc</Tecla>
          {t("menu.ayuda.cerrar")}
        </span>
      </div>

      <div
        id={`${id}-lista`}
        role="listbox"
        aria-label={t("menu.pantallas")}
        className="columns-1 gap-3 overflow-y-auto p-3 sm:columns-2 lg:columns-3"
      >
        {grupos.map((grupo) => (
          <div
            key={grupo.id}
            role="group"
            aria-labelledby={`${id}-grupo-${grupo.id}`}
            className="break-inside-avoid px-1 py-2"
          >
            <div
              id={`${id}-grupo-${grupo.id}`}
              className="px-2.5 pb-1.5 text-xs font-bold tracking-[.08em] text-muted-foreground uppercase"
            >
              {grupo.titulo}
            </div>
            {grupo.opciones.map((opcion) => {
              const indice = opciones.indexOf(opcion);
              const seleccionada = indice === enFoco;
              const actual = opcion.id === idActiva;
              const Icono = opcion.icono;
              return (
                <div
                  key={opcion.id}
                  id={idOpcion(indice)}
                  role="option"
                  aria-selected={seleccionada}
                  aria-current={actual ? "page" : undefined}
                  aria-disabled={opcion.href ? undefined : true}
                  onClick={() => elegir(opcion)}
                  onMouseMove={() => indice !== enFoco && setFoco(indice)}
                  className={cn(
                    "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 sm:h-10 text-left text-sm transition-colors select-none",
                    actual
                      ? "bg-primary font-semibold text-primary-foreground"
                      : seleccionada
                        ? "bg-secondary text-foreground ring-1 ring-input"
                        : "text-muted-foreground",
                    !opcion.href && !seleccionada && "opacity-55",
                  )}
                >
                  <Icono className="size-[17px] shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{opcion.etiqueta}</span>
                  {seleccionada && opcion.href && (
                    <span className="hidden sm:inline-flex">
                      <Tecla>↵</Tecla>
                    </span>
                  )}
                  {!opcion.href && (
                    <span className="text-xs text-muted-foreground">
                      {t("menu.sprint", { sprint: opcion.sprint })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {grupos.length === 0 && (
          <Aviso>{busqueda ? t("menu.sinResultados", { busqueda }) : t("menu.sinOpciones")}</Aviso>
        )}
      </div>

      <div className="hidden items-center gap-4 border-t border-border bg-background/40 px-5 py-2 text-xs text-muted-foreground sm:flex">
        <span className="flex items-center gap-1.5">
          <Tecla>↑</Tecla>
          <Tecla>↓</Tecla>
          {t("menu.ayuda.moverse")}
        </span>
        <span className="flex items-center gap-1.5">
          <Tecla>↵</Tecla>
          {t("menu.ayuda.abrir")}
        </span>
        <span className="flex items-center gap-1.5">
          <Tecla>{esMac() ? "⌘" : "Ctrl"}</Tecla>
          <Tecla>K</Tecla>
          {t("menu.ayuda.alternar")}
        </span>
        <span className="flex items-center gap-1.5">
          <Tecla>/</Tecla>
          {t("menu.ayuda.buscar")}
        </span>
      </div>
    </>
  );
}

/** Pantallas permitidas en la empresa activa. Debe usarse dentro de <PermisosProvider>. */
function PantallasEmpresa(props: Omit<MenuPrincipalProps, "empresaId"> & { empresaId: string }) {
  const { t } = useTranslation("layout");
  const { estado, permisos } = usePermisos();
  if (estado === "cargando") return <Aviso rol="status">{t("menu.cargando")}</Aviso>;
  if (estado === "error") return <Aviso rol="alert">{t("menu.error")}</Aviso>;
  return <ListaPantallas {...props} permisos={permisos} />;
}

/**
 * Menú principal del sistema, como en el prototipo de interfaz (S1-T26): un panel flotante que se abre desde el
 * encabezado, con buscador y las pantallas agrupadas por módulo. Debe estar dentro del Dialog.Root del layout.
 */
export function MenuPrincipal({ idActiva, empresaId, onNavegar }: MenuPrincipalProps) {
  const { t } = useTranslation("layout");
  return (
    <DialogPrimitive.Portal>
      {/* El menú no es modal (el botón del encabezado sigue activo para cerrarlo): este fondo es solo visual */}
      <div aria-hidden className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-in fade-in-0" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className="fixed top-[68px] left-2 z-[60] flex max-h-[calc(100dvh-80px)] w-[calc(100vw-16px)] origin-top-left flex-col overflow-hidden rounded-[20px] sm:top-[72px] sm:left-4 sm:max-h-[calc(100dvh-84px)] sm:w-[min(1040px,calc(100vw-32px))] sm:rounded-3xl border border-border bg-card text-card-foreground shadow-[0_24px_64px_rgba(0,0,0,0.6)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[.98] data-closed:animate-out data-closed:fade-out-0"
      >
        <DialogPrimitive.Title className="sr-only">{t("menu.etiqueta")}</DialogPrimitive.Title>
        {empresaId ? (
          <PantallasEmpresa empresaId={empresaId} idActiva={idActiva} onNavegar={onNavegar} />
        ) : (
          <Aviso>{t("menu.sinEmpresa")}</Aviso>
        )}
        <FilaCuenta />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
