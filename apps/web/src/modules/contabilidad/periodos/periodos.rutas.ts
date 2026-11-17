import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPeriodos = lazy(() =>
  import("./pantalla-periodos").then((m) => ({ default: m.PantallaPeriodos })),
);

export default [
  { patron: "/empresas/:empresaId/periodos", componente: PantallaPeriodos },
] satisfies DefinicionRuta[];
