import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaImportacion = lazy(() =>
  import("./pantalla-importacion").then((modulo) => ({ default: modulo.PantallaImportacion })),
);

export default [
  { patron: "/empresas/:empresaId/importar", componente: PantallaImportacion },
] satisfies DefinicionRuta[];
