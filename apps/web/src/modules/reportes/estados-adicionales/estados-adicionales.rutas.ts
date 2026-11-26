import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaEstadosAdicionales = lazy(() =>
  import("./pantalla-estados-adicionales").then((m) => ({ default: m.PantallaEstadosAdicionales })),
);

export default [
  { patron: "/empresas/:empresaId/estados/adicionales", componente: PantallaEstadosAdicionales },
] satisfies DefinicionRuta[];
