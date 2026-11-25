import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaRespaldos = lazy(() =>
  import("./pantalla-respaldos").then((m) => ({ default: m.PantallaRespaldos })),
);

export default [
  { patron: "/empresas/:empresaId/respaldos", componente: PantallaRespaldos },
] satisfies DefinicionRuta[];
