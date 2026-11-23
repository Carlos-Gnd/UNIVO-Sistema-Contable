import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaKardex = lazy(() => import("./pantalla-kardex").then((m) => ({ default: m.PantallaKardex })));

export default [
  { patron: "/empresas/:empresaId/kardex", componente: PantallaKardex },
] satisfies DefinicionRuta[];
