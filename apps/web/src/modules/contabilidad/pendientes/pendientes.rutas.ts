import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPendientes = lazy(() =>
  import("./pantalla-pendientes").then((m) => ({ default: m.PantallaPendientes })),
);

export default [
  { patron: "/empresas/:empresaId/pendientes", componente: PantallaPendientes },
] satisfies DefinicionRuta[];
