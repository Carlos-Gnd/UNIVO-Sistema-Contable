import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { editarEmpresaSchema, type EmpresaDetalle } from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { NOMBRE_ROL, usePermiso, usePermisos } from "@/modules/organizacion/permisos";
import { CamposEmpresa } from "./campos-empresa";
import { empresaQuery, useEditarEmpresa } from "./empresa-api";
import { erroresDeRegistro } from "./errores";
import { ETIQUETA_CLASIFICACION, ETIQUETA_TIPO_CONTRIBUYENTE, TEXTOS_EMPRESA as T } from "./textos";
import { cambiosEmpresa, valoresDeEmpresa, type ValoresEmpresa } from "./valores";

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** Datos de la empresa activa (S1-T41, HU-06). Ruta /empresas/:empresaId. */
export function PantallaEmpresa({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const empresa = useQuery(empresaQuery(empresaId));

  return (
    <Pagina className="max-w-[1120px]">
      {empresa.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {empresa.isError && (
        <Alert variant="error">
          <p>
            {T.errorCarga} {mensajeDeError(empresa.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void empresa.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {/* Al guardar cambia actualizadoEn y el formulario se reinicia con lo que devolvió la API */}
      {empresa.isSuccess && <DatosEmpresa key={empresa.data.actualizadoEn} empresa={empresa.data} />}
    </Pagina>
  );
}

function DatosEmpresa({ empresa }: { empresa: EmpresaDetalle }) {
  const editable = usePermiso("empresa.configurar");
  const { rol } = usePermisos();
  const inicial = valoresDeEmpresa(empresa);
  const [valores, setValores] = useState<ValoresEmpresa>(inicial);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const editar = useEditarEmpresa(empresa.id);
  const cambios = cambiosEmpresa(valores, inicial);
  const sinCambios = Object.keys(cambios).length === 0;

  function cambiar(parcial: Partial<ValoresEmpresa>) {
    setValores((v) => ({ ...v, ...parcial }));
    setErrores((e) => {
      const copia = { ...e };
      for (const campo of Object.keys(parcial)) delete copia[campo];
      return copia;
    });
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!editable || sinCambios || editar.isPending) return;
    editar.reset();
    const r = validarFormulario(editarEmpresaSchema, cambios);
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    editar.mutate(r.datos, {
      onSuccess: () => toast.success(T.acciones.guardada),
      onError: (error) => setErrores(erroresDeRegistro(error)),
    });
  }

  const hayErrores = Object.keys(errores).length > 0;
  const aviso =
    editar.isError && !hayErrores
      ? mensajeDeError(editar.error)
      : hayErrores
        ? T.acciones.corregir
        : undefined;

  return (
    <>
      <EncabezadoPagina
        titulo={T.tituloEmpresa}
        descripcion={editable ? T.descripcionEditable : T.descripcionSoloLectura}
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="grid justify-items-center gap-4 p-5 text-center">
          <span
            aria-hidden="true"
            className="grid size-28 place-items-center rounded-3xl bg-primary text-3xl font-bold text-primary-foreground"
          >
            {iniciales(empresa.nombreComercial ?? empresa.nombre)}
          </span>
          <div>
            <p className="font-semibold text-foreground">{empresa.nombreComercial ?? empresa.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {ETIQUETA_TIPO_CONTRIBUYENTE[empresa.tipoContribuyente]} ·{" "}
              {ETIQUETA_CLASIFICACION[empresa.clasificacion]}
            </p>
          </div>
          <div className="h-px w-full bg-border" />
          <dl className="grid w-full grid-cols-2 gap-3 text-left text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">{T.resumen.nit}</dt>
              <dd className="whitespace-nowrap tabular-nums">{empresa.nit}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{T.resumen.tuRol}</dt>
              <dd>{rol ? NOMBRE_ROL[rol] : "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title={T.datosGenerales} />
          <form noValidate onSubmit={alEnviar}>
            <div className="p-5">
              <CamposEmpresa
                valores={valores}
                onCambio={cambiar}
                errores={errores}
                soloLectura={!editable}
                tipoFijo
              />
            </div>
            {aviso && (
              <Alert variant="error" className="mx-5 mb-5">
                {aviso}
              </Alert>
            )}
            {editable && (
              <div className="flex justify-end gap-2 px-5 pb-5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-full px-5"
                  disabled={sinCambios || editar.isPending}
                  onClick={() => {
                    setValores(inicial);
                    setErrores({});
                    editar.reset();
                  }}
                >
                  {T.acciones.descartar}
                </Button>
                <Button
                  type="submit"
                  className="h-11 rounded-full px-5"
                  disabled={sinCambios || editar.isPending}
                >
                  {editar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                  {editar.isPending ? T.acciones.guardando : T.acciones.guardar}
                </Button>
              </div>
            )}
          </form>
        </Card>
      </div>
    </>
  );
}
