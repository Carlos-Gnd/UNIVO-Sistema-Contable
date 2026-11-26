import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaTerceros = lazy(() =>
  import("./pantalla-terceros").then((m) => ({ default: m.PantallaTerceros })),
);

export default [
  { patron: "/empresas/:empresaId/clientes", componente: PantallaTerceros },
] satisfies DefinicionRuta[];
