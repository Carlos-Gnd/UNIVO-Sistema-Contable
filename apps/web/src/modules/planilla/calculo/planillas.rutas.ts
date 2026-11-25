import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCalculoPlanilla = lazy(() =>
  import("./pantalla-calculo-planilla").then((modulo) => ({ default: modulo.PantallaCalculoPlanilla })),
);

export default [
  { patron: "/empresas/:empresaId/planillas", componente: PantallaCalculoPlanilla },
] satisfies DefinicionRuta[];
