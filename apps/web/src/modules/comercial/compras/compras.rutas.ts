import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCompras = lazy(() =>
  import("./pantalla-compras").then((m) => ({ default: m.PantallaCompras })),
);

export default [
  { patron: "/empresas/:empresaId/compras", componente: PantallaCompras },
] satisfies DefinicionRuta[];
