import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCasoSociedad = lazy(() =>
  import("./pantalla-caso-sociedad").then((modulo) => ({ default: modulo.PantallaCasoSociedad })),
);

export default [
  { patron: "/empresas/:empresaId/caso-sociedad", componente: PantallaCasoSociedad },
] satisfies DefinicionRuta[];
