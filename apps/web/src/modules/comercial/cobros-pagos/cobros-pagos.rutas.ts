import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaCobrosPagos = lazy(() =>
  import("./pantalla-cobros-pagos").then((m) => ({ default: m.PantallaCobrosPagos })),
);

export default [
  { patron: "/empresas/:empresaId/cobros-pagos", componente: PantallaCobrosPagos },
] satisfies DefinicionRuta[];
