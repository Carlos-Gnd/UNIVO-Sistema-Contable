import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCierreAnual = lazy(() =>
  import("./pantalla-cierre-anual").then((modulo) => ({ default: modulo.PantallaCierreAnual })),
);

export default [
  { patron: "/empresas/:empresaId/cierre", componente: PantallaCierreAnual },
] satisfies DefinicionRuta[];
