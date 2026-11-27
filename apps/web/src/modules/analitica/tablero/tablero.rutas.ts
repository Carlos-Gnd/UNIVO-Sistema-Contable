import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaTablero = lazy(() =>
  import("./pantalla-tablero").then((modulo) => ({ default: modulo.PantallaTablero })),
);

export default [
  { patron: "/empresas/:empresaId/tablero", componente: PantallaTablero },
] satisfies DefinicionRuta[];
