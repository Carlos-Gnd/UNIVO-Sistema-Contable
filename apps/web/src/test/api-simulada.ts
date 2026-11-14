import { vi } from "vitest";

export interface PeticionSimulada {
  metodo: string;
  /** Ruta sin la URL base ni la cadena de consulta, por ejemplo /empresas/e1/sucursales */
  ruta: string;
  consulta: URLSearchParams;
  cuerpo: unknown;
  cabeceras: Record<string, string>;
}

export interface RespuestaSimulada {
  estado?: number;
  cuerpo?: unknown;
}

type Manejador =
  RespuestaSimulada | ((peticion: PeticionSimulada) => RespuestaSimulada | Promise<RespuestaSimulada>);

/**
 * Reemplaza fetch por una API en memoria. Las claves son "MÉTODO /ruta"; una petición sin manejador
 * responde 404 para que la prueba falle de forma visible. Devuelve la lista de peticiones recibidas.
 *
 *   const peticiones = simularApi({ "GET /empresas/e1/sucursales": { cuerpo: [] } });
 */
export function simularApi(manejadores: Record<string, Manejador>): PeticionSimulada[] {
  const peticiones: PeticionSimulada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(entrada));
      const metodo = (init.method ?? "GET").toUpperCase();
      const peticion: PeticionSimulada = {
        metodo,
        ruta: url.pathname,
        consulta: url.searchParams,
        cuerpo: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
        cabeceras: (init.headers ?? {}) as Record<string, string>,
      };
      peticiones.push(peticion);
      const manejador = manejadores[`${metodo} ${url.pathname}`];
      const respuesta =
        manejador === undefined
          ? { estado: 404, cuerpo: { message: `Sin simulación para ${metodo} ${url.pathname}` } }
          : typeof manejador === "function"
            ? await manejador(peticion)
            : manejador;
      const estado = respuesta.estado ?? 200;
      return new Response(respuesta.cuerpo === undefined ? null : JSON.stringify(respuesta.cuerpo), {
        status: estado,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return peticiones;
}
