import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaBalanceGeneral = lazy(() =>
  import("./pantalla-balance-general").then((m) => ({ default: m.PantallaBalanceGeneral })),
);

export default [
  { patron: "/empresas/:empresaId/estados/balance-general", componente: PantallaBalanceGeneral },
] satisfies DefinicionRuta[];
