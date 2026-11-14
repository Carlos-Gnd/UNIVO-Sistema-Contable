import { useMemo } from "react";
import { Calculator } from "lucide-react";
import { cn } from "cn";
import { Enlace } from "@/components/enlace";
import { usePermisos } from "@/modules/organizacion/permisos";
import { gruposVisibles, opcionActiva, type GrupoVisible } from "./opciones-menu";
import { TEXTOS_LAYOUT as T } from "./textos";

interface MenuLateralProps {
  ruta: string;
  empresaId?: string;
  /** Se llama al elegir una opción (por ejemplo, para cerrar el menú en el celular) */
  onNavegar?: () => void;
}

/** Marca del sistema; lleva a la pantalla de la empresa activa. */
function Marca({ empresaId, onNavegar }: { empresaId?: string; onNavegar?: () => void }) {
  const contenido = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Calculator className="size-4" aria-hidden />
      </span>
      <span className="truncate font-semibold text-foreground">{T.marca}</span>
    </>
  );
  const clases = "flex h-16 items-center gap-3 px-4";
  return empresaId ? (
    <Enlace href={`/empresas/${encodeURIComponent(empresaId)}`} className={clases} onClick={onNavegar}>
      {contenido}
    </Enlace>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

function Aviso({ children, rol }: { children: string; rol?: "status" | "alert" }) {
  return (
    <p role={rol} className="px-4 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function ListaOpciones({
  grupos,
  ruta,
  onNavegar,
}: {
  grupos: readonly GrupoVisible[];
  ruta: string;
  onNavegar?: () => void;
}) {
  const activa = opcionActiva(ruta, grupos);
  return (
    <div className="flex flex-col gap-5 px-3 py-2">
      {grupos.map((grupo) => (
        <section key={grupo.id} aria-labelledby={`menu-grupo-${grupo.id}`}>
          <h2
            id={`menu-grupo-${grupo.id}`}
            className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
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
                    onClick={onNavegar}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors outline-none",
                      "hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      esActiva && "bg-secondary font-semibold text-foreground",
                    )}
                  >
                    <Icono className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{opcion.etiqueta}</span>
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
  onNavegar,
}: Required<Pick<MenuLateralProps, "ruta" | "empresaId">> & Pick<MenuLateralProps, "onNavegar">) {
  const { estado, permisos } = usePermisos();
  const grupos = useMemo(() => gruposVisibles(empresaId, { permisos }), [empresaId, permisos]);

  if (estado === "cargando") return <Aviso rol="status">{T.menu.cargando}</Aviso>;
  if (estado === "error") return <Aviso rol="alert">{T.menu.error}</Aviso>;
  if (grupos.length === 0) return <Aviso>{T.menu.sinOpciones}</Aviso>;
  return <ListaOpciones grupos={grupos} ruta={ruta} onNavegar={onNavegar} />;
}

/** Contenido del menú lateral: marca y opciones agrupadas por módulo (S1-T26). */
export function MenuLateral({ ruta, empresaId, onNavegar }: MenuLateralProps) {
  return (
    <nav aria-label={T.menu.etiqueta} className="flex h-full flex-col">
      <Marca empresaId={empresaId} onNavegar={onNavegar} />
      <div className="flex-1 overflow-y-auto pb-6">
        {empresaId ? (
          <OpcionesEmpresa ruta={ruta} empresaId={empresaId} onNavegar={onNavegar} />
        ) : (
          <Aviso>{T.menu.sinEmpresa}</Aviso>
        )}
      </div>
    </nav>
  );
}
