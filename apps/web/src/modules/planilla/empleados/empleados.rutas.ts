import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaEmpleados = lazy(() =>
  import("./pantalla-empleados").then((m) => ({ default: m.PantallaEmpleados })),
);

export default [
  { patron: "/empresas/:empresaId/empleados", componente: PantallaEmpleados },
] satisfies DefinicionRuta[];
