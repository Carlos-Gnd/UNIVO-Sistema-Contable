import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaProductos = lazy(() =>
  import("./pantalla-productos").then((m) => ({ default: m.PantallaProductos })),
);

export default [
  { patron: "/empresas/:empresaId/productos", componente: PantallaProductos },
] satisfies DefinicionRuta[];
