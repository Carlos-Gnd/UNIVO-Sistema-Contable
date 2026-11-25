import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaTasasPlanilla = lazy(() =>
  import("./pantalla-tasas-planilla").then((m) => ({ default: m.PantallaTasasPlanilla })),
);

export default [
  { patron: "/empresas/:empresaId/tasas-planilla", componente: PantallaTasasPlanilla },
] satisfies DefinicionRuta[];
