import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCatalogo = lazy(() =>
  import("./pantalla-catalogo").then((modulo) => ({ default: modulo.PantallaCatalogo })),
);

export default [
  { patron: "/empresas/:empresaId/catalogo", componente: PantallaCatalogo },
] satisfies DefinicionRuta[];
