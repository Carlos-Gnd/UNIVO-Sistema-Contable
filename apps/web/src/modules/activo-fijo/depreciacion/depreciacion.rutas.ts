import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaDepreciacion = lazy(() =>
  import("./pantalla-depreciacion").then((m) => ({ default: m.PantallaDepreciacion })),
);

export default [
  { patron: "/empresas/:empresaId/depreciacion", componente: PantallaDepreciacion },
] satisfies DefinicionRuta[];
