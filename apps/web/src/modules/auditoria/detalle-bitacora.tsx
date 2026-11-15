import { Info, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import type { EntradaBitacora } from "@contable/shared";
import { Button } from "@/components/ui/button";
import { cambiosDe, describirRegistro, formatearFechaHora } from "./presentacion";

/**
 * Panel lateral con el detalle de un cambio de la bitácora: qué registro cambió y cada campo antes y después,
 * como en el prototipo (S1-T59).
 */
export function DetalleBitacora({
  entrada,
  onCerrar,
  onFiltrarUsuario,
}: {
  entrada: EntradaBitacora | null;
  onCerrar: () => void;
  onFiltrarUsuario: (usuario: { id: string; nombre: string }) => void;
}) {
  const { t } = useTranslation("bitacora");
  const cambios = entrada ? cambiosDe(entrada, t) : [];
  const usuario = entrada?.usuario;

  return (
    <DialogPrimitive.Root open={entrada !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col gap-5 overflow-y-auto border-l border-border bg-card p-6 text-card-foreground shadow-2xl outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right">
          {entrada && (
            <>
              <div className="pr-10">
                <DialogPrimitive.Title className="text-xl font-semibold text-foreground">
                  {t("detalle.titulo", {
                    accion: t(`acciones.${entrada.accion}`),
                    modulo: t(`modulos.${entrada.modulo ?? "otro"}`),
                  })}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {t("detalle.subtitulo", {
                    fecha: formatearFechaHora(entrada.fecha),
                    usuario: usuario?.nombre ?? t("sistema"),
                  })}
                </DialogPrimitive.Description>
              </div>

              <div className="text-sm">
                <span className="block text-xs text-muted-foreground">{t("detalle.registro")}</span>
                <span className="text-foreground">{describirRegistro(entrada, t)}</span>
              </div>

              {cambios.length > 0 ? (
                <table className="w-full overflow-hidden rounded-2xl border border-border text-sm">
                  <thead className="bg-secondary text-xs font-bold tracking-[.08em] text-muted-foreground uppercase">
                    <tr>
                      <th scope="col" className="p-3 text-left font-bold">
                        {t("detalle.campo")}
                      </th>
                      <th scope="col" className="p-3 text-left font-bold">
                        {t("detalle.antes")}
                      </th>
                      <th scope="col" className="p-3 text-left font-bold">
                        {t("detalle.despues")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cambios.map((cambio) => (
                      <tr key={cambio.campo} className="border-t border-border align-top">
                        <th scope="row" className="w-[34%] p-3 text-left font-normal text-muted-foreground">
                          {cambio.etiqueta}
                        </th>
                        <td className="p-3 break-words text-muted-foreground line-through decoration-muted-foreground/50">
                          {cambio.antes}
                        </td>
                        <td className="p-3 font-semibold break-words text-foreground">{cambio.despues}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-muted-foreground">{t("detalle.sinCambios")}</p>
              )}

              {usuario && (
                <Button
                  variant="outline"
                  className="h-10 self-start rounded-full px-4"
                  onClick={() => {
                    onFiltrarUsuario({ id: usuario.id, nombre: usuario.nombre });
                    onCerrar();
                  }}
                >
                  {t("filtrarUsuario", { nombre: usuario.nombre })}
                </Button>
              )}

              <p className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("detalle.inmutable")}
              </p>

              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="absolute top-5 right-5"
                  aria-label={t("detalle.cerrar")}
                >
                  <X className="size-5" aria-hidden />
                </Button>
              </DialogPrimitive.Close>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
