import { lazy } from "react";

export default [
  {
    patron: "/empresas/:empresaId/catalogo/listado",
    componente: lazy(() =>
      import("./pantalla-cuentas").then((modulo) => ({ default: modulo.PantallaCuentas })),
    ),
  },
];
