import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaRazones = lazy(() =>
  import("./pantalla-razones").then((modulo) => ({ default: modulo.PantallaRazones })),
);

export default [
  { patron: "/empresas/:empresaId/razones", componente: PantallaRazones },
] satisfies DefinicionRuta[];
