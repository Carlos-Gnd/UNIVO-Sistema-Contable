import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaSeries = lazy(() => import("./pantalla-series").then((m) => ({ default: m.PantallaSeries })));

export default [
  { patron: "/empresas/:empresaId/toma-fisica", componente: PantallaSeries },
] satisfies DefinicionRuta[];
