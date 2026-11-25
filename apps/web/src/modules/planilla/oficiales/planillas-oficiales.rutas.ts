import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPlanillasOficiales = lazy(() =>
  import("./pantalla-planillas-oficiales").then((modulo) => ({ default: modulo.PantallaPlanillasOficiales })),
);

export default [
  { patron: "/empresas/:empresaId/planillas-oficiales", componente: PantallaPlanillasOficiales },
] satisfies DefinicionRuta[];
