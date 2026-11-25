import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPrestaciones = lazy(() =>
  import("./pantalla-prestaciones").then((modulo) => ({ default: modulo.PantallaPrestaciones })),
);

export default [
  { patron: "/empresas/:empresaId/prestaciones", componente: PantallaPrestaciones },
] satisfies DefinicionRuta[];
