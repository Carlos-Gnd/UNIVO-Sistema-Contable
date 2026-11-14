import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPartida = lazy(() =>
  import("./pantalla-partida").then((m) => ({ default: m.PantallaPartida })),
);

export default [
  { patron: "/empresas/:empresaId/partidas/nueva", componente: PantallaPartida },
  { patron: "/empresas/:empresaId/partidas/:partidaId", componente: PantallaPartida },
] satisfies DefinicionRuta[];
