import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCalendario = lazy(() =>
  import("./pantalla-calendario").then((m) => ({ default: m.PantallaCalendario })),
);

export default [
  { patron: "/empresas/:empresaId/calendario-tributario", componente: PantallaCalendario },
] satisfies DefinicionRuta[];
