import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaNotas = lazy(() => import("./pantalla-notas").then((m) => ({ default: m.PantallaNotas })));

export default [
  { patron: "/empresas/:empresaId/estados/notas", componente: PantallaNotas },
] satisfies DefinicionRuta[];
