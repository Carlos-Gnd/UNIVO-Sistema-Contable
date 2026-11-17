import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaSucursales = lazy(() =>
  import("./pantalla-sucursales").then((m) => ({ default: m.PantallaSucursales })),
);

export default [
  { patron: "/empresas/:empresaId/sucursales", componente: PantallaSucursales },
] satisfies DefinicionRuta[];
