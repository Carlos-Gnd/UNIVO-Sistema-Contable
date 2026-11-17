import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaRegistrarEmpresa = lazy(() =>
  import("./pantalla-registrar-empresa").then((m) => ({ default: m.PantallaRegistrarEmpresa })),
);
const PantallaEmpresa = lazy(() =>
  import("./pantalla-empresa").then((m) => ({ default: m.PantallaEmpresa })),
);

export default [
  { patron: "/empresas/nueva", componente: PantallaRegistrarEmpresa },
  { patron: "/empresas/:empresaId", componente: PantallaEmpresa },
] satisfies DefinicionRuta[];
