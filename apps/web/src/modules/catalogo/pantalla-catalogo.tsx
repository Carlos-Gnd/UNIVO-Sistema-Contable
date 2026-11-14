import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { mensajeDeError } from "@/lib/api";
import { prepararCuentas } from "../contabilidad/partidas/lineas";
import { ArbolCuentas } from "./arbol-cuentas";
import { cuentasCatalogoQuery } from "./catalogo-api";
import { ETIQUETAS_ARBOL_CUENTAS, TEXTOS_CATALOGO as T } from "./textos";

/** Vista jerárquica del catálogo de la empresa (S1-T72, HU-18). */
export function PantallaCatalogo({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const cuentas = useQuery(cuentasCatalogoQuery(empresaId));
  const cuentasPreparadas = useMemo(() => prepararCuentas(cuentas.data ?? []), [cuentas.data]);

  return (
    <Pagina className="max-w-[1120px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />

      {cuentas.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}

      {cuentas.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(cuentas.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void cuentas.refetch()}
          >
            {T.reintentar}
          </Button>
        </Alert>
      )}

      {cuentas.isSuccess && <ArbolCuentas cuentas={cuentasPreparadas} etiquetas={ETIQUETAS_ARBOL_CUENTAS} />}
    </Pagina>
  );
}
