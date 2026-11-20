import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaEstadoResultados = lazy(() =>
  import("./pantalla-estado-resultados").then((m) => ({ default: m.PantallaEstadoResultados })),
);

export default [
  { patron: "/empresas/:empresaId/estados", componente: PantallaEstadoResultados },
] satisfies DefinicionRuta[];
