import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaEstadosFirmados = lazy(() =>
  import("./pantalla-estados-firmados").then((m) => ({ default: m.PantallaEstadosFirmados })),
);

export default [
  { patron: "/empresas/:empresaId/estados/firmados", componente: PantallaEstadosFirmados },
] satisfies DefinicionRuta[];
