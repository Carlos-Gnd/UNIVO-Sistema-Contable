import { Dinero, type DocumentoPendiente } from "@contable/shared";

/** Reparte el monto del abono de lo más antiguo a lo más nuevo, sin pasar el saldo de cada documento. */
export function repartirAbono(
  documentos: readonly Pick<DocumentoPendiente, "id" | "saldo">[],
  monto: string,
): { documentoId: string; monto: string }[] {
  let resto = Dinero.de(monto);
  const reparto: { documentoId: string; monto: string }[] = [];
  for (const d of documentos) {
    if (resto.esCero() || resto.esNegativo()) break;
    const saldo = Dinero.de(d.saldo);
    const aplicado = saldo.mayorQue(resto) ? resto : saldo;
    reparto.push({ documentoId: d.id, monto: aplicado.aTexto() });
    resto = resto.menos(aplicado);
  }
  return reparto;
}
