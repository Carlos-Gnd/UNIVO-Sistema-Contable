import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaVentas = lazy(() => import("./pantalla-ventas").then((m) => ({ default: m.PantallaVentas })));

export default [
  { patron: "/empresas/:empresaId/ventas", componente: PantallaVentas },
] satisfies DefinicionRuta[];
