import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { crearEmpresaSchema } from "@contable/shared";
import { navegar } from "@/app/navegacion";
import { Campo } from "@/components/campo";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { CamposEmpresa } from "./campos-empresa";
import { useRegistrarEmpresa } from "./empresa-api";
import { erroresDeRegistro } from "./errores";
import { TEXTOS_EMPRESA as T } from "./textos";
import {
  entradaRegistro,
  MATRIZ_NUEVA,
  VALORES_NUEVA,
  type ValoresCasaMatriz,
  type ValoresEmpresa,
} from "./valores";

/** Registro de una empresa con su casa matriz (S1-T41, HU-06). Ruta /empresas/nueva. */
export function PantallaRegistrarEmpresa() {
  const [valores, setValores] = useState<ValoresEmpresa>(VALORES_NUEVA);
  const [matriz, setMatriz] = useState<ValoresCasaMatriz>(MATRIZ_NUEVA);
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const registrar = useRegistrarEmpresa();

  function cambiar(cambios: Partial<ValoresEmpresa>) {
    setValores((v) => ({ ...v, ...cambios }));
    setErrores((e) => {
      const copia = { ...e };
      for (const campo of Object.keys(cambios)) delete copia[campo];
      return copia;
    });
  }

  function cambiarMatriz(campo: keyof ValoresCasaMatriz, valor: string) {
    setMatriz((m) => ({ ...m, [campo]: valor }));
    setErrores(({ casaMatriz: _quitado, ...resto }) => resto);
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending) return;
    registrar.reset();
    const r = validarFormulario(crearEmpresaSchema, entradaRegistro(valores, matriz));
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    registrar.mutate(r.datos, {
      onSuccess: (empresa) => {
        toast.success(T.acciones.registrada);
        navegar(`/empresas/${empresa.id}`, { reemplazar: true });
      },
      onError: (error) => setErrores(erroresDeRegistro(error)),
    });
  }

  const hayErrores = Object.keys(errores).length > 0;
  const aviso =
    registrar.isError && !hayErrores
      ? mensajeDeError(registrar.error)
      : hayErrores
        ? T.acciones.corregir
        : undefined;
  const errorMatriz = errores.casaMatriz?.[0];

  return (
    <Pagina className="max-w-[920px]">
      <EncabezadoPagina titulo={T.tituloRegistrar} descripcion={T.descripcionRegistrar} />
      <form noValidate onSubmit={alEnviar} className="flex flex-col gap-5">
        <Card>
          <CardHeader title={T.datosFiscales} />
          <div className="p-5">
            <CamposEmpresa
              valores={valores}
              onCambio={cambiar}
              errores={errores}
              soloLectura={false}
              tipoFijo={false}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title={T.casaMatriz} description={T.casaMatrizDescripcion} />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <Campo id="matriz-nombre" etiqueta={T.campos.matrizNombre}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10"
                  maxLength={150}
                  value={matriz.nombre}
                  onChange={(e) => cambiarMatriz("nombre", e.target.value)}
                />
              )}
            </Campo>
            <Campo id="matriz-establecimiento" etiqueta={T.campos.matrizEstablecimiento}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10 uppercase tabular-nums"
                  maxLength={4}
                  value={matriz.codigoEstablecimiento}
                  onChange={(e) => cambiarMatriz("codigoEstablecimiento", e.target.value.toUpperCase())}
                />
              )}
            </Campo>
            <Campo id="matriz-punto-venta" etiqueta={T.campos.matrizPuntoVenta}>
              {(p) => (
                <Input
                  {...p}
                  className="h-10 uppercase tabular-nums"
                  maxLength={4}
                  value={matriz.codigoPuntoVenta}
                  onChange={(e) => cambiarMatriz("codigoPuntoVenta", e.target.value.toUpperCase())}
                />
              )}
            </Campo>
            <Campo
              id="matriz-direccion"
              etiqueta={T.campos.matrizDireccion}
              ayuda={T.campos.opcional}
              className="sm:col-span-3"
            >
              {(p) => (
                <Input
                  {...p}
                  className="h-10"
                  maxLength={300}
                  value={matriz.direccion}
                  onChange={(e) => cambiarMatriz("direccion", e.target.value)}
                />
              )}
            </Campo>
            {errorMatriz && (
              <p role="alert" className="text-sm text-destructive sm:col-span-3">
                {errorMatriz}
              </p>
            )}
          </div>
        </Card>

        {aviso && <Alert variant="error">{aviso}</Alert>}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => window.history.back()}
            disabled={registrar.isPending}
          >
            {T.acciones.cancelar}
          </Button>
          <Button type="submit" className="h-11 rounded-full px-5" disabled={registrar.isPending}>
            {registrar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {registrar.isPending ? T.acciones.registrando : T.acciones.registrar}
          </Button>
        </div>
      </form>
    </Pagina>
  );
}
