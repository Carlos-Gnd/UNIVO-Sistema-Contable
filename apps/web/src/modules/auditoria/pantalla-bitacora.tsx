import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import type { EntradaBitacora } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mensajeDeError } from "@/lib/api";
import { bitacoraQuery } from "./bitacora-api";
import { DetalleBitacora } from "./detalle-bitacora";
import { FILTROS_INICIALES, aConsulta, hayFiltros, rangoInvalido, type FiltrosPantalla } from "./filtros";
import { FiltrosBitacora } from "./filtros-bitacora";
import { describirRegistro, formatearFechaHora } from "./presentacion";

/**
 * Pantalla de la bitácora de auditoría (S1-T59, HU-11): cada cambio de la empresa, del más reciente al más
 * antiguo, con filtros por módulo, acción, fechas y usuario. Al elegir un cambio se ve cada campo antes y después.
 */
export function PantallaBitacora({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const { t } = useTranslation("bitacora");
  const [filtros, setFiltros] = useState<FiltrosPantalla>(FILTROS_INICIALES);
  const [pagina, setPagina] = useState(1);
  const [seleccionada, setSeleccionada] = useState<EntradaBitacora | null>(null);
  const invalido = rangoInvalido(filtros);
  const bitacora = useQuery({ ...bitacoraQuery(empresaId, aConsulta(filtros, pagina)), enabled: !invalido });

  function cambiarFiltros(nuevos: FiltrosPantalla) {
    setFiltros(nuevos);
    setPagina(1);
  }

  const filtrarUsuario = (usuario: { id: string; nombre: string }) => cambiarFiltros({ ...filtros, usuario });
  const datos = bitacora.data;

  return (
    <Pagina>
      <EncabezadoPagina titulo={t("titulo")} descripcion={t("descripcion")} />

      <Card className="overflow-hidden">
        <FiltrosBitacora filtros={filtros} onCambiar={cambiarFiltros} />

        {bitacora.isPending && !invalido && (
          <p role="status" className="p-10 text-center text-muted-foreground">
            {t("cargando")}
          </p>
        )}

        {bitacora.isError && (
          <div className="p-4">
            <Alert variant="error">
              <p>
                {t("errorCarga")} {mensajeDeError(bitacora.error)}
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void bitacora.refetch()}>
                {t("reintentar")}
              </Button>
            </Alert>
          </div>
        )}

        {datos && !invalido && (
          <>
            {datos.registros.length === 0 ? (
              <p className="p-10 text-center text-muted-foreground">
                {hayFiltros(filtros) ? t("vacio") : t("vacioSinFiltros")}
              </p>
            ) : (
              <div className={cn("transition-opacity", bitacora.isPlaceholderData && "opacity-60")}>
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("columnas.fecha")}</TableHead>
                      <TableHead>{t("columnas.usuario")}</TableHead>
                      <TableHead>{t("columnas.accion")}</TableHead>
                      <TableHead>{t("columnas.modulo")}</TableHead>
                      <TableHead>{t("columnas.registro")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.registros.map((entrada) => {
                      const registro = describirRegistro(entrada, t);
                      const usuario = entrada.usuario;
                      return (
                        <TableRow
                          key={entrada.id}
                          className="cursor-pointer"
                          onClick={() => setSeleccionada(entrada)}
                        >
                          <TableCell className="amount text-left whitespace-nowrap text-muted-foreground">
                            {formatearFechaHora(entrada.fecha)}
                          </TableCell>
                          <TableCell>
                            {usuario ? (
                              <button
                                type="button"
                                title={t("filtrarUsuario", { nombre: usuario.nombre })}
                                onClick={(evento) => {
                                  evento.stopPropagation();
                                  filtrarUsuario({ id: usuario.id, nombre: usuario.nombre });
                                }}
                                className="text-left text-foreground underline-offset-4 hover:underline"
                              >
                                {usuario.nombre}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">{t("sistema")}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge>{t(`acciones.${entrada.accion}`)}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {t(`modulos.${entrada.modulo ?? "otro"}`)}
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              aria-label={t("detalle.verDetalle", { registro })}
                              onClick={(evento) => {
                                evento.stopPropagation();
                                setSeleccionada(entrada);
                              }}
                              className="text-left text-foreground underline-offset-4 hover:underline"
                            >
                              {registro}
                            </button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {datos.total > 0 && (
              <nav
                aria-label={t("paginacion.etiqueta")}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground"
              >
                <span>
                  {t("paginacion.resumen", {
                    desde: (datos.pagina - 1) * datos.porPagina + 1,
                    hasta: Math.min(datos.pagina * datos.porPagina, datos.total),
                    total: datos.total,
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <span>{t("paginacion.pagina", { pagina: datos.pagina, paginas: datos.paginas })}</span>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="rounded-full"
                    aria-label={t("paginacion.anterior")}
                    disabled={datos.pagina <= 1}
                    onClick={() => setPagina(datos.pagina - 1)}
                  >
                    <ChevronLeft aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="rounded-full"
                    aria-label={t("paginacion.siguiente")}
                    disabled={datos.pagina >= datos.paginas}
                    onClick={() => setPagina(datos.pagina + 1)}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
              </nav>
            )}
          </>
        )}
      </Card>

      <DetalleBitacora
        entrada={seleccionada}
        onCerrar={() => setSeleccionada(null)}
        onFiltrarUsuario={filtrarUsuario}
      />
    </Pagina>
  );
}
