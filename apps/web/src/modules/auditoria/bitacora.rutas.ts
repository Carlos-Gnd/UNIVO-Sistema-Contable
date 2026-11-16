import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaBitacora = lazy(() =>
  import("./pantalla-bitacora").then((modulo) => ({ default: modulo.PantallaBitacora })),
);

export default [
  { patron: "/empresas/:empresaId/bitacora", componente: PantallaBitacora },
] satisfies DefinicionRuta[];
