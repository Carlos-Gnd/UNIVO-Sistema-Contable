export type CuentaBuscable = {
  id: string;
  codigo: string;
  nombre: string;
  cuentaPadreId: string | null;
};

const normalizar = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

/** Devuelve las coincidencias por código/nombre y conserva sus antecesoras para mostrar la jerarquía. */
export function filtrarCuentasPorBusqueda<T extends CuentaBuscable>(
  cuentas: readonly T[],
  consulta: string,
): T[] {
  const termino = normalizar(consulta.trim());
  if (!termino) return [...cuentas];

  const porId = new Map(cuentas.map((cuenta) => [cuenta.id, cuenta]));
  const hijasPorPadre = new Map<string, T[]>();
  for (const cuenta of cuentas) {
    if (!cuenta.cuentaPadreId) continue;
    const hijas = hijasPorPadre.get(cuenta.cuentaPadreId) ?? [];
    hijas.push(cuenta);
    hijasPorPadre.set(cuenta.cuentaPadreId, hijas);
  }
  const incluidas = new Set<string>();
  const subarbolesRecorridos = new Set<string>();

  const incluirSubarbol = (cuenta: T) => {
    if (subarbolesRecorridos.has(cuenta.id)) return;
    subarbolesRecorridos.add(cuenta.id);
    incluidas.add(cuenta.id);
    hijasPorPadre.get(cuenta.id)?.forEach(incluirSubarbol);
  };

  for (const cuenta of cuentas) {
    if (!normalizar(`${cuenta.codigo} ${cuenta.nombre}`).includes(termino)) continue;

    let actual: T | undefined = cuenta;
    while (actual && !incluidas.has(actual.id)) {
      incluidas.add(actual.id);
      actual = actual.cuentaPadreId ? porId.get(actual.cuentaPadreId) : undefined;
    }
    incluirSubarbol(cuenta);
  }

  return cuentas.filter((cuenta) => incluidas.has(cuenta.id));
}
