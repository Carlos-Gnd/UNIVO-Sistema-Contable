import { useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import {
  formatoEstadosSchema,
  metodoValuacionSchema,
  modoNumeracionSchema,
  sistemaInventarioSchema,
  type EditarParametros,
  type ParametrosEmpresa,
} from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { mensajeDeError } from "@/lib/api";
import { usePermiso } from "@/modules/organizacion/permisos";
import { empresaQuery } from "@/modules/organizacion/empresa/empresa-api";
import { parametrosQuery, useEditarParametros } from "./parametros-api";
import {
  ETIQUETA_FORMATO_ESTADOS,
  ETIQUETA_METODO_VALUACION,
  ETIQUETA_MODO_NUMERACION,
  ETIQUETA_SISTEMA_INVENTARIO,
  ORDEN_MODO_NUMERACION,
  TEXTO_AYUDA_NUMERACION,
  TEXTOS_PARAMETROS as T,
} from "./textos";

type Valores = Pick<
  ParametrosEmpresa,
  "modoNumeracion" | "formatoEstados" | "metodoValuacion" | "sistemaInventario"
>;

const valores = ({
  modoNumeracion,
  formatoEstados,
  metodoValuacion,
  sistemaInventario,
}: Valores): Valores => ({
  modoNumeracion,
  formatoEstados,
  metodoValuacion,
  sistemaInventario,
});

/** Pantalla de parámetros contables de la empresa (S2-T03, HU-12). */
export function PantallaParametros({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const consulta = useQuery(parametrosQuery(empresaId));
  const empresa = useQuery({ ...empresaQuery(empresaId), enabled: Boolean(empresaId) });

  return (
    <Pagina className="max-w-[1070px] gap-6 px-4 pt-10 sm:px-6 sm:pt-12">
      <header>
        <h1 className="text-[36px] font-normal tracking-tight sm:text-[42px]">{T.titulo}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {empresa.data?.nombreComercial ?? empresa.data?.nombre ?? T.empresa} · {T.descripcion}
        </p>
      </header>
      {consulta.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {consulta.isError && (
        <Alert variant="error" role="alert">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {consulta.isSuccess && (
        <FormularioParametros
          key={JSON.stringify(valores(consulta.data))}
          empresaId={empresaId}
          datos={consulta.data}
        />
      )}
    </Pagina>
  );
}

function FormularioParametros({ empresaId, datos }: { empresaId: string; datos: ParametrosEmpresa }) {
  const editable = usePermiso("empresa.configurar");
  const iniciales = valores(datos);
  const [actuales, setActuales] = useState<Valores>(iniciales);
  const editar = useEditarParametros(empresaId);
  const cambios: EditarParametros = {
    ...(actuales.modoNumeracion !== iniciales.modoNumeracion
      ? { modoNumeracion: actuales.modoNumeracion }
      : {}),
    ...(actuales.formatoEstados !== iniciales.formatoEstados
      ? { formatoEstados: actuales.formatoEstados }
      : {}),
    ...(actuales.metodoValuacion !== iniciales.metodoValuacion
      ? { metodoValuacion: actuales.metodoValuacion }
      : {}),
    ...(actuales.sistemaInventario !== iniciales.sistemaInventario
      ? { sistemaInventario: actuales.sistemaInventario }
      : {}),
  };
  const sinCambios = Object.keys(cambios).length === 0;
  const bloqueados = new Set(datos.bloqueados);

  function cambiar<K extends keyof Valores>(campo: K, valor: Valores[K]) {
    setActuales((previos) => ({ ...previos, [campo]: valor }));
  }

  function seleccionar<T extends keyof Valores>(campo: T, parsear: (valor: string) => Valores[T]) {
    return (evento: ChangeEvent<HTMLInputElement>) => cambiar(campo, parsear(evento.currentTarget.value));
  }

  function guardar() {
    if (!editable || sinCambios || editar.isPending) return;
    editar.mutate(cambios, { onSuccess: () => toast.success(T.guardado) });
  }

  const errorGuardar = editar.isError ? mensajeDeError(editar.error) : null;

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        guardar();
      }}
    >
      {datos.tieneMovimientos && <Alert className="px-5 py-4 text-base">{T.conMovimientos}</Alert>}
      {!editable && <Alert>{T.soloLectura}</Alert>}

      <Card>
        <CardHeader title={T.secciones.partidas.titulo} description={T.secciones.partidas.descripcion}>
          {bloqueados.has("modoNumeracion") && <AvisoBloqueo texto={T.bloqueado} />}
        </CardHeader>
        <div className="p-5">
          <SelectorSegmentado
            nombre="modoNumeracion"
            valor={actuales.modoNumeracion}
            opciones={ORDEN_MODO_NUMERACION.map((valor) => ({
              valor,
              texto: ETIQUETA_MODO_NUMERACION[valor],
            }))}
            deshabilitado={!editable || bloqueados.has("modoNumeracion") || editar.isPending}
            alCambiar={seleccionar("modoNumeracion", (valor) => modoNumeracionSchema.parse(valor))}
            etiqueta={T.campos.modoNumeracion}
          />
          <p className="mt-3 text-sm text-muted-foreground">
            {TEXTO_AYUDA_NUMERACION[actuales.modoNumeracion]}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title={T.secciones.estados.titulo} description={T.secciones.estados.descripcion} />
        <div className="p-5">
          <SelectorSegmentado
            nombre="formatoEstados"
            valor={actuales.formatoEstados}
            opciones={formatoEstadosSchema.options.map((valor) => ({
              valor,
              texto: ETIQUETA_FORMATO_ESTADOS[valor],
            }))}
            deshabilitado={!editable || editar.isPending}
            alCambiar={seleccionar("formatoEstados", (valor) => formatoEstadosSchema.parse(valor))}
            etiqueta={T.campos.formatoEstados}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={T.secciones.inventario.titulo} description={T.secciones.inventario.descripcion}>
          {(bloqueados.has("metodoValuacion") || bloqueados.has("sistemaInventario")) && (
            <AvisoBloqueo texto={T.bloqueado} />
          )}
        </CardHeader>
        <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
          <SelectorSegmentado
            nombre="metodoValuacion"
            valor={actuales.metodoValuacion}
            opciones={metodoValuacionSchema.options.map((valor) => ({
              valor,
              texto: ETIQUETA_METODO_VALUACION[valor],
            }))}
            deshabilitado={!editable || bloqueados.has("metodoValuacion") || editar.isPending}
            alCambiar={seleccionar("metodoValuacion", (valor) => metodoValuacionSchema.parse(valor))}
            etiqueta={T.campos.metodoValuacion}
          />
          <SelectorSegmentado
            nombre="sistemaInventario"
            valor={actuales.sistemaInventario}
            opciones={sistemaInventarioSchema.options.map((valor) => ({
              valor,
              texto: ETIQUETA_SISTEMA_INVENTARIO[valor],
            }))}
            deshabilitado={!editable || bloqueados.has("sistemaInventario") || editar.isPending}
            alCambiar={seleccionar("sistemaInventario", (valor) => sistemaInventarioSchema.parse(valor))}
            etiqueta={T.campos.sistemaInventario}
          />
        </div>
      </Card>

      {errorGuardar && (
        <Alert variant="error" role="alert">
          {errorGuardar}
        </Alert>
      )}
      {editable && (
        <div className="flex justify-end pb-2">
          <Button type="submit" disabled={sinCambios || editar.isPending} className="rounded-full px-7">
            {editar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {editar.isPending ? T.acciones.guardando : T.acciones.guardar}
          </Button>
        </div>
      )}
    </form>
  );
}

function AvisoBloqueo({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <LockKeyhole aria-hidden="true" className="size-4" />
      {texto}
    </span>
  );
}

function SelectorSegmentado<T extends string>({
  nombre,
  etiqueta,
  valor,
  opciones,
  deshabilitado,
  alCambiar,
}: {
  nombre: string;
  etiqueta: string;
  valor: T;
  opciones: { valor: T; texto: string }[];
  deshabilitado: boolean;
  alCambiar: (evento: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <fieldset disabled={deshabilitado} className="min-w-0">
      <legend className="sr-only">{etiqueta}</legend>
      <div className="flex min-h-14 flex-wrap items-center gap-1 rounded-full border border-border bg-background p-1.5">
        {opciones.map((opcion) => (
          <label key={opcion.valor} className="cursor-pointer">
            <input
              className="peer sr-only"
              type="radio"
              name={nombre}
              value={opcion.valor}
              checked={valor === opcion.valor}
              onChange={alCambiar}
            />
            <span className="inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
              {opcion.texto}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
