import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPartida = lazy(() =>
  import("./pantalla-partida").then((m) => ({ default: m.PantallaPartida })),
);
const PantallaEditarPartida = lazy(() =>
  import("./pantalla-editar-partida").then((m) => ({ default: m.PantallaEditarPartida })),
);

export default [
  { patron: "/empresas/:empresaId/partidas/nueva", componente: PantallaPartida },
  { patron: "/empresas/:empresaId/partidas/:partidaId/editar", componente: PantallaEditarPartida },
  { patron: "/empresas/:empresaId/partidas/:partidaId", componente: PantallaPartida },
] satisfies DefinicionRuta[];
