import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaLibroMayor = lazy(() =>
  import("./pantalla-libro-mayor").then((m) => ({ default: m.PantallaLibroMayor })),
);

export default [
  { patron: "/empresas/:empresaId/libro-mayor", componente: PantallaLibroMayor },
] satisfies DefinicionRuta[];
