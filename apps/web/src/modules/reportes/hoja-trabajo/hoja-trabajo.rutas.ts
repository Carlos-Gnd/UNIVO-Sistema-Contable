import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaHojaTrabajo = lazy(() =>
  import("./pantalla-hoja-trabajo").then((m) => ({ default: m.PantallaHojaTrabajo })),
);

export default [
  { patron: "/empresas/:empresaId/hoja-trabajo", componente: PantallaHojaTrabajo },
] satisfies DefinicionRuta[];
