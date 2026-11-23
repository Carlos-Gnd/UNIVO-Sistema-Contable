import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaLibroDiario = lazy(() =>
  import("./pantalla-libro-diario").then((m) => ({ default: m.PantallaLibroDiario })),
);

export default [
  { patron: "/empresas/:empresaId/libro-diario", componente: PantallaLibroDiario },
] satisfies DefinicionRuta[];
