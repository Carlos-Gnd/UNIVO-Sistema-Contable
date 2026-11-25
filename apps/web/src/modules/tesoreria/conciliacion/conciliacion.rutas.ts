import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCajaChica = lazy(() =>
  import("./pantalla-caja-chica").then((modulo) => ({ default: modulo.PantallaCajaChica })),
);

export default [
  { patron: "/empresas/:empresaId/conciliacion", componente: PantallaCajaChica },
] satisfies DefinicionRuta[];
