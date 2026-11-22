import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaParametros = lazy(() =>
  import("./pantalla-parametros").then((m) => ({ default: m.PantallaParametros })),
);

export default [
  { patron: "/empresas/:empresaId/parametros", componente: PantallaParametros },
] satisfies DefinicionRuta[];
