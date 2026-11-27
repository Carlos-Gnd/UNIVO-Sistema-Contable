import { lazy } from "react";
import type { DefinicionRuta } from "@/app/rutas";

const PantallaVerificacion = lazy(() =>
  import("./pantalla-verificacion").then((m) => ({ default: m.PantallaVerificacion })),
);

/** Portal público (HU-88): se abre sin iniciar sesión, por ejemplo desde el QR del PDF firmado. */
export default [
  { patron: "/verificar", componente: PantallaVerificacion, publica: true },
  { patron: "/verificar/:codigo", componente: PantallaVerificacion, publica: true },
] satisfies DefinicionRuta[];
