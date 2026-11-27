// Contrato de seguridad: toda ruta HTTP declara su política de acceso (S1, revisión de seguridad).
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PUBLIC_ROUTE_KEY } from "../src/auth/public.decorator.js";
import { AUTORIZA_EN_CASO_DE_USO, PERMISO_REQUERIDO } from "../src/compartido/permiso.decorator.js";

type Clase = new (...args: never[]) => unknown;

/** Recorre el árbol de módulos y devuelve todos los controladores registrados. */
function controladores(raiz: Clase, vistos = new Set<Clase>(), acumulado = new Set<Clase>()): Set<Clase> {
  if (vistos.has(raiz)) return acumulado;
  vistos.add(raiz);
  for (const c of (Reflect.getMetadata("controllers", raiz) ?? []) as Clase[]) acumulado.add(c);
  for (const m of (Reflect.getMetadata("imports", raiz) ?? []) as Clase[]) {
    if (typeof m === "function") controladores(m, vistos, acumulado);
  }
  return acumulado;
}

function rutas() {
  const filas: { ruta: string; politica: string | null }[] = [];
  for (const controlador of controladores(AppModule)) {
    const prefijo = String(Reflect.getMetadata("path", controlador) ?? "");
    for (const nombre of Object.getOwnPropertyNames(controlador.prototype)) {
      const manejador = (controlador.prototype as Record<string, unknown>)[nombre];
      if (typeof manejador !== "function" || nombre === "constructor") continue;
      if (Reflect.getMetadata("method", manejador) === undefined) continue;
      const clave = (k: string) =>
        (Reflect.getMetadata(k, manejador) ?? Reflect.getMetadata(k, controlador)) as unknown;
      const politica = clave(PERMISO_REQUERIDO)
        ? "permiso"
        : clave(PUBLIC_ROUTE_KEY)
          ? "publica"
          : clave(AUTORIZA_EN_CASO_DE_USO)
            ? "caso-de-uso"
            : null;
      filas.push({
        ruta: `${controlador.name}.${nombre} (${prefijo}/${String(Reflect.getMetadata("path", manejador))})`,
        politica,
      });
    }
  }
  return filas;
}

describe("política de acceso de las rutas", () => {
  it("encuentra las rutas de la API", () => {
    expect(rutas().length).toBeGreaterThan(90);
  });

  it("toda ruta declara @Permiso, @Public o @AutorizaEnCasoDeUso", () => {
    const sinPolitica = rutas()
      .filter((r) => r.politica === null)
      .map((r) => r.ruta);
    expect(sinPolitica).toEqual([]);
  });

  it("solo la raíz, el health y el portal de verificación de estados firmados (HU-88) son públicas", () => {
    const publicas = rutas()
      .filter((r) => r.politica === "publica")
      .map((r) => r.ruta.split(" ")[0]);
    expect(publicas.sort()).toEqual([
      "AppController.getHealth",
      "AppController.getRoot",
      "VerificacionController.verificar",
      "VerificacionController.verificarArchivo",
    ]);
  });
});
