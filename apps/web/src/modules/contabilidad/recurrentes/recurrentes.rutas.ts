import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaRecurrentes = lazy(() =>
  import("./pantalla-recurrentes").then((m) => ({ default: m.PantallaRecurrentes })),
);

export default [
  { patron: "/empresas/:empresaId/partidas-recurrentes", componente: PantallaRecurrentes },
] satisfies DefinicionRuta[];
