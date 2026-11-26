import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaLibrosIva = lazy(() =>
  import("./pantalla-libros-iva").then((m) => ({ default: m.PantallaLibrosIva })),
);

export default [
  { patron: "/empresas/:empresaId/libros-iva", componente: PantallaLibrosIva },
] satisfies DefinicionRuta[];
