import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaDte = lazy(() => import("./pantalla-dte").then((m) => ({ default: m.PantallaDte })));
const VisorDte = lazy(() => import("./visor-dte").then((m) => ({ default: m.VisorDte })));

export default [
  { patron: "/empresas/:empresaId/dte", componente: PantallaDte },
  { patron: "/empresas/:empresaId/dte/:dteId", componente: VisorDte },
] satisfies DefinicionRuta[];
