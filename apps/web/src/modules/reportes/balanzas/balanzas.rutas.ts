import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaBalanzas = lazy(() =>
  import("./pantalla-balanzas").then((m) => ({ default: m.PantallaBalanzas })),
);

export default [
  { patron: "/empresas/:empresaId/balanzas", componente: PantallaBalanzas },
] satisfies DefinicionRuta[];
