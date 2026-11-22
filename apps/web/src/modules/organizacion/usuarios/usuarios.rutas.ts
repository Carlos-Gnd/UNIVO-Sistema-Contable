import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaUsuarios = lazy(() =>
  import("./pantalla-usuarios").then((m) => ({ default: m.PantallaUsuarios })),
);

export default [
  { patron: "/empresas/:empresaId/usuarios", componente: PantallaUsuarios },
] satisfies DefinicionRuta[];
