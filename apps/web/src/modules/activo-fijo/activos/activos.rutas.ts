import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaActivos = lazy(() =>
  import("./pantalla-activos").then((m) => ({ default: m.PantallaActivos })),
);

export default [
  { patron: "/empresas/:empresaId/activos-fijos", componente: PantallaActivos },
] satisfies DefinicionRuta[];
