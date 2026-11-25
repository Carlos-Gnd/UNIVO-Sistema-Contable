import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  crearConfiguracionPlanillaSchema,
  type ConfiguracionPlanillaVista,
  type CrearConfiguracionPlanilla,
} from "@contable/shared";
import type { Parametros } from "@/app/rutas";
import { Campo } from "@/components/campo";
import { Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import { usePermiso } from "@/modules/organizacion/permisos";
import { tasasPlanillaQuery, useCrearConfiguracionPlanilla } from "./tasas-planilla-api";
import { TEXTOS_TASAS_PLANILLA as T } from "./textos";

interface ValoresTramo {
  desde: string;
  hasta: string;
  porcentaje: string;
  cuotaFija: string;
}

interface ValoresFormulario {
  vigenteDesde: string;
  tasaIsssLaboral: string;
  tasaIsssPatronal: string;
  techoIsss: string;
  tasaAfpLaboral: string;
  tasaAfpPatronal: string;
  tramos: ValoresTramo[];
}

function valoresIniciales(configuracion?: ConfiguracionPlanillaVista): ValoresFormulario {
  return {
    vigenteDesde: "",
    tasaIsssLaboral: configuracion?.tasaIsssLaboral ?? "3.00",
    tasaIsssPatronal: configuracion?.tasaIsssPatronal ?? "7.50",
    techoIsss: configuracion?.techoIsss ?? "1000.00",
    tasaAfpLaboral: configuracion?.tasaAfpLaboral ?? "7.25",
    tasaAfpPatronal: configuracion?.tasaAfpPatronal ?? "8.75",
    tramos: (
      configuracion?.tramos ?? [
        { desde: "0.00", hasta: "550.00", porcentaje: "0.00", cuotaFija: "0.00" },
        { desde: "550.00", hasta: "895.24", porcentaje: "10.00", cuotaFija: "17.67" },
        { desde: "895.24", hasta: "2038.10", porcentaje: "20.00", cuotaFija: "60.00" },
        { desde: "2038.10", hasta: null, porcentaje: "30.00", cuotaFija: "288.57" },
      ]
    ).map((tramo) => ({ ...tramo, hasta: tramo.hasta ?? "" })),
  };
}

export function PantallaTasasPlanilla({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeConfigurar = usePermiso("empresa.configurar");
  const consulta = useQuery({
    ...tasasPlanillaQuery(empresaId),
    enabled: puedeConfigurar && Boolean(empresaId),
  });

  return (
    <Pagina className="max-w-[1070px] gap-6 px-4 pt-10 sm:px-6 sm:pt-12">
      <header>
        <h1 className="text-[36px] font-normal tracking-tight sm:text-[42px]">{T.titulo}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{T.descripcion}</p>
      </header>
      {!puedeConfigurar && <Alert>{T.sinPermiso}</Alert>}
      {puedeConfigurar && consulta.isPending && (
        <p role="status" className="text-muted-foreground">
          {T.cargando}
        </p>
      )}
      {puedeConfigurar && consulta.isError && (
        <Alert variant="error" role="alert">
          <p>
            {T.errorCarga} {mensajeDeError(consulta.error)}
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
            {T.reintentar}
          </Button>
        </Alert>
      )}
      {puedeConfigurar && consulta.isSuccess && (
        <Contenido empresaId={empresaId} configuraciones={consulta.data} />
      )}
    </Pagina>
  );
}

function Contenido({
  empresaId,
  configuraciones,
}: {
  empresaId: string;
  configuraciones: ConfiguracionPlanillaVista[];
}) {
  const [abierto, setAbierto] = useState(false);
  const actual = configuraciones[0];
  return (
    <>
      {configuraciones.length === 0 ? (
        <Alert>{T.sinConfiguracion}</Alert>
      ) : (
        <Card>
          <CardHeader
            title={T.historial}
            description={`${configuraciones.length} ${configuraciones.length === 1 ? "versión" : "versiones"}`}
          >
            <Button onClick={() => setAbierto(true)}>
              <Plus aria-hidden="true" />
              {T.agregar}
            </Button>
          </CardHeader>
          <div className="divide-y divide-border">
            {configuraciones.map((configuracion) => (
              <article key={configuracion.id} className="grid gap-5 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {T.vigenteDesde}: {formatearFecha(configuracion.vigenteDesde)}
                  </h3>
                  {configuracion.id === actual?.id && (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      Vigente más reciente
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm md:grid-cols-5">
                  <Dato etiqueta={T.isssLaboral} valor={`${configuracion.tasaIsssLaboral}%`} />
                  <Dato etiqueta={T.isssPatronal} valor={`${configuracion.tasaIsssPatronal}%`} />
                  <Dato etiqueta={T.techoIsss} valor={formatearDinero(configuracion.techoIsss)} />
                  <Dato etiqueta={T.afpLaboral} valor={`${configuracion.tasaAfpLaboral}%`} />
                  <Dato etiqueta={T.afpPatronal} valor={`${configuracion.tasaAfpPatronal}%`} />
                </dl>
                <div>
                  <h4 className="mb-2 text-sm font-semibold">{T.retencion}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">{T.tabla.tramo}</th>
                          <th className="px-3 py-2 font-medium">{T.tabla.porcentaje}</th>
                          <th className="px-3 py-2 font-medium">{T.tabla.cuota}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configuracion.tramos.map((tramo, indice) => (
                          <tr key={`${configuracion.id}-${indice}`} className="border-t border-border">
                            <td className="px-3 py-2 tabular-nums">
                              {formatearDinero(tramo.desde)} a{" "}
                              {tramo.hasta ? formatearDinero(tramo.hasta) : T.abierto}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{tramo.porcentaje}%</td>
                            <td className="px-3 py-2 tabular-nums">{formatearDinero(tramo.cuotaFija)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}
      <FormularioTasas
        empresaId={empresaId}
        base={actual}
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
      />
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-1 font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

function FormularioTasas({
  empresaId,
  base,
  abierto,
  onCerrar,
}: {
  empresaId: string;
  base?: ConfiguracionPlanillaVista;
  abierto: boolean;
  onCerrar: () => void;
}) {
  return (
    <Dialog open={abierto} onOpenChange={(visible) => !visible && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {abierto && (
          <ContenidoFormulario
            key={base?.id ?? "inicial"}
            empresaId={empresaId}
            base={base}
            onCerrar={onCerrar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContenidoFormulario({
  empresaId,
  base,
  onCerrar,
}: {
  empresaId: string;
  base?: ConfiguracionPlanillaVista;
  onCerrar: () => void;
}) {
  const [valores, setValores] = useState(() => valoresIniciales(base));
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const guardar = useCrearConfiguracionPlanilla(empresaId);
  const guardando = guardar.isPending;

  function cambiar(campo: keyof Omit<ValoresFormulario, "tramos">, valor: string) {
    setValores((previo) => ({ ...previo, [campo]: valor }));
    setErrores({});
  }

  function cambiarTramo(indice: number, campo: keyof ValoresTramo, valor: string) {
    setValores((previo) => ({
      ...previo,
      tramos: previo.tramos.map((tramo, i) => (i === indice ? { ...tramo, [campo]: valor } : tramo)),
    }));
    setErrores({});
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    guardar.reset();
    const resultado = validarFormulario(crearConfiguracionPlanillaSchema, {
      ...valores,
      tramos: valores.tramos.map((tramo) => ({ ...tramo, hasta: tramo.hasta === "" ? null : tramo.hasta })),
    });
    if (!resultado.ok) {
      setErrores(resultado.errores);
      return;
    }
    guardar.mutate(resultado.datos as CrearConfiguracionPlanilla, {
      onSuccess: () => {
        toast.success(T.guardado);
        onCerrar();
      },
      onError: (error) => {
        if (error instanceof ErrorApi && error.estado === 400) setErrores(error.errores);
      },
    });
  }

  function agregarTramo() {
    const ultimo = valores.tramos.at(-1);
    setValores((previo) => ({
      ...previo,
      tramos: [
        ...previo.tramos,
        { desde: ultimo?.desde ?? "0.00", hasta: "", porcentaje: "0.00", cuotaFija: "0.00" },
      ],
    }));
    setErrores({});
  }

  function quitarTramo(indice: number) {
    setValores((previo) => ({ ...previo, tramos: previo.tramos.filter((_, i) => i !== indice) }));
    setErrores({});
  }

  const error = (campo: string) => errores[campo]?.[0];
  const aviso =
    errores._formulario?.[0] ??
    (guardar.error && !(guardar.error instanceof ErrorApi && guardar.error.estado === 400)
      ? mensajeDeError(guardar.error)
      : undefined);

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{T.tituloFormulario}</DialogTitle>
        <DialogDescription>{T.descripcionFormulario}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="tasas-vigente-desde" etiqueta={T.vigenteDesde} error={error("vigenteDesde")}>
          {(p) => (
            <Input
              {...p}
              type="date"
              className="h-10"
              value={valores.vigenteDesde}
              onChange={(e) => cambiar("vigenteDesde", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tasas-techo-isss" etiqueta={T.techoIsss} error={error("techoIsss")}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10"
              value={valores.techoIsss}
              onChange={(e) => cambiar("techoIsss", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tasas-isss-laboral" etiqueta={T.isssLaboral} error={error("tasaIsssLaboral")}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10"
              value={valores.tasaIsssLaboral}
              onChange={(e) => cambiar("tasaIsssLaboral", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tasas-isss-patronal" etiqueta={T.isssPatronal} error={error("tasaIsssPatronal")}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10"
              value={valores.tasaIsssPatronal}
              onChange={(e) => cambiar("tasaIsssPatronal", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tasas-afp-laboral" etiqueta={T.afpLaboral} error={error("tasaAfpLaboral")}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10"
              value={valores.tasaAfpLaboral}
              onChange={(e) => cambiar("tasaAfpLaboral", e.target.value)}
            />
          )}
        </Campo>
        <Campo id="tasas-afp-patronal" etiqueta={T.afpPatronal} error={error("tasaAfpPatronal")}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10"
              value={valores.tasaAfpPatronal}
              onChange={(e) => cambiar("tasaAfpPatronal", e.target.value)}
            />
          )}
        </Campo>
      </div>
      <section aria-labelledby="tasas-tabla-titulo" className="grid gap-3">
        <h3 id="tasas-tabla-titulo" className="font-semibold">
          {T.retencion}
        </h3>
        {valores.tramos.map((tramo, indice) => (
          <fieldset
            key={indice}
            className="grid grid-cols-1 items-end gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]"
          >
            <legend className="px-1 text-xs text-muted-foreground">
              {T.tabla.tramo} {indice + 1}
            </legend>
            <Campo id={`tramo-${indice}-desde`} etiqueta={T.desde} error={error(`tramos.${indice}.desde`)}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  className="h-10"
                  value={tramo.desde}
                  onChange={(e) => cambiarTramo(indice, "desde", e.target.value)}
                />
              )}
            </Campo>
            <Campo id={`tramo-${indice}-hasta`} etiqueta={T.hasta} error={error(`tramos.${indice}.hasta`)}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  placeholder={T.abierto}
                  className="h-10"
                  value={tramo.hasta}
                  onChange={(e) => cambiarTramo(indice, "hasta", e.target.value)}
                />
              )}
            </Campo>
            <Campo
              id={`tramo-${indice}-porcentaje`}
              etiqueta={T.porcentaje}
              error={error(`tramos.${indice}.porcentaje`)}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  className="h-10"
                  value={tramo.porcentaje}
                  onChange={(e) => cambiarTramo(indice, "porcentaje", e.target.value)}
                />
              )}
            </Campo>
            <Campo
              id={`tramo-${indice}-cuota`}
              etiqueta={T.cuota}
              error={error(`tramos.${indice}.cuotaFija`)}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  className="h-10"
                  value={tramo.cuotaFija}
                  onChange={(e) => cambiarTramo(indice, "cuotaFija", e.target.value)}
                />
              )}
            </Campo>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={`${T.quitarTramo} ${indice + 1}`}
              disabled={valores.tramos.length <= 1}
              onClick={() => quitarTramo(indice)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={agregarTramo}
          disabled={valores.tramos.length >= 20}
        >
          <Plus aria-hidden="true" />
          {T.agregarTramo}
        </Button>
      </section>
      {aviso && <Alert variant="error">{aviso}</Alert>}
      {errores._formulario && <Alert variant="error">{T.invalidos}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={guardando}>
          {guardando && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {guardando ? T.guardando : T.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
