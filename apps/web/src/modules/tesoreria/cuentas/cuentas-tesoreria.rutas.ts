import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCuentasTesoreria = lazy(() =>
  import("./pantalla-cuentas-tesoreria").then((m) => ({ default: m.PantallaCuentasTesoreria })),
);

export default [
  { patron: "/empresas/:empresaId/caja-y-bancos", componente: PantallaCuentasTesoreria },
] satisfies DefinicionRuta[];
