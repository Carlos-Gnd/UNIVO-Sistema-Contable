import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaDeclaraciones = lazy(() =>
  import("./pantalla-declaraciones").then((modulo) => ({ default: modulo.PantallaDeclaraciones })),
);

export default [
  { patron: "/empresas/:empresaId/declaraciones", componente: PantallaDeclaraciones },
] satisfies DefinicionRuta[];
