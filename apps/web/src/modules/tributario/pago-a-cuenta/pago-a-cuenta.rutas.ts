import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaPagoACuenta = lazy(() =>
  import("./pantalla-pago-a-cuenta").then((modulo) => ({ default: modulo.PantallaPagoACuenta })),
);

export default [
  { patron: "/empresas/:empresaId/declaraciones", componente: PantallaPagoACuenta },
] satisfies DefinicionRuta[];
