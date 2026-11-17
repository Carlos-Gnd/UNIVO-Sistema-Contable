import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import {
  crearPartidaSchema,
  type CrearPartidaEntrada,
  type ErrorLinea,
  type SucursalDetalle,
} from "@contable/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { validarFormulario } from "@/lib/validacion";
import { CabeceraPartidaFormulario } from "./cabecera-partida";
import { DetallePartida } from "./detalle-partida";
import { EstadoCuadre } from "./estado-cuadre";
import { calcularPartida, nuevaClave, type FilaPartida } from "./lineas";
import { crearPartida, editarPartida } from "./partidas-api";
import { TEXTOS_PARTIDA } from "./textos";
import type { CuentaParaPartida, PartidaVista } from "./tipos";
import { aEntradaApi, huella, type CabeceraPartida, type ValoresIniciales } from "./valores";

const T = TEXTOS_PARTIDA.acciones;

/** Errores por línea que devuelve la API con 422 ({ mensaje, lineas: ErrorLinea[] }). */
function lineasDelError(error: unknown): ErrorLinea[] {
  if (!(error instanceof ErrorApi) || error.estado !== 422) return [];
  const cuerpo = error.cuerpo as { lineas?: unknown } | undefined;
  return Array.isArray(cuerpo?.lineas) ? (cuerpo.lineas as ErrorLinea[]) : [];
}

interface FormularioPartidaProps {
  empresaId: string;
  /** Borrador que se edita; sin él se registra una partida nueva */
  partida?: PartidaVista;
  iniciales: ValoresIniciales;
  cuentas: readonly CuentaParaPartida[];
  cuentasDisponibles: boolean;
  sucursales: readonly SucursalDetalle[];
  soloLectura: boolean;
  onGuardado: (partida: PartidaVista, creada: boolean) => void;
  onSalir: () => void;
  /** Acciones adicionales junto a «Guardar borrador» (por ejemplo, contabilizar, HU-22) */
  acciones?: (estado: { cuadra: boolean; sinCambios: boolean }) => ReactNode;
}

/** Registro y edición de una partida manual en borrador (HU-20). */
export function FormularioPartida({
  empresaId,
  partida,
  iniciales,
  cuentas,
  cuentasDisponibles,
  sucursales,
  soloLectura,
  onGuardado,
  onSalir,
  acciones,
}: FormularioPartidaProps) {
  const [cabecera, setCabecera] = useState(iniciales.cabecera);
  const [filas, setFilas] = useState(iniciales.filas);
  const [intento, setIntento] = useState(false);
  const [erroresCampos, setErroresCampos] = useState<ErroresPorCampo>({});
  const [erroresLineasApi, setErroresLineasApi] = useState<ErrorLinea[]>([]);
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  const resultado = useMemo(() => calcularPartida(filas, cuentas), [filas, cuentas]);
  const sinCambios = huella({ cabecera, filas }) === huella(iniciales);
  const erroresLineas = intento ? [...resultado.errores, ...erroresLineasApi] : erroresLineasApi;

  const guardar = useMutation({
    mutationFn: (datos: CrearPartidaEntrada) =>
      partida ? editarPartida(empresaId, partida.id, datos) : crearPartida(empresaId, datos),
    onSuccess: (guardada) => onGuardado(guardada, !partida),
    onError: (error) => {
      if (error instanceof ErrorApi) setErroresCampos(error.errores);
      setErroresLineasApi(lineasDelError(error));
    },
  });

  function limpiarErroresApi() {
    if (erroresLineasApi.length) setErroresLineasApi([]);
    if (guardar.isError) guardar.reset();
  }

  function cambiarCabecera(cambios: Partial<CabeceraPartida>) {
    setCabecera((c) => ({ ...c, ...cambios }));
    setErroresCampos((e) => {
      const copia = { ...e };
      for (const campo of Object.keys(cambios)) delete copia[campo];
      return copia;
    });
    limpiarErroresApi();
  }

  function cambiarFilas(fn: (filas: FilaPartida[]) => FilaPartida[]) {
    setFilas(fn);
    setErroresCampos(({ lineas: _lineas, ...resto }) => resto);
    limpiarErroresApi();
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (soloLectura || guardar.isPending) return;
    setIntento(true);
    const entrada = aEntradaApi({ cabecera, filas });
    const validacion = validarFormulario(crearPartidaSchema, entrada);
    if (!validacion.ok) {
      // Sin sucursal elegida el esquema responde «Identificador inválido.»; se explica qué falta
      const errores = cabecera.sucursalId
        ? validacion.errores
        : { ...validacion.errores, sucursalId: [TEXTOS_PARTIDA.cabecera.sucursalRequerida] };
      setErroresCampos(errores);
      return;
    }
    setErroresCampos({});
    // Una línea sin monto o con una cuenta que no se puede usar no se guarda; el descuadre sí
    if (resultado.errores.length) return;
    // Lo normalizado por el esquema: textos recortados, opcionales vacíos omitidos y montos con dos decimales
    guardar.mutate(validacion.datos);
  }

  const errorGeneral =
    guardar.isError && !(guardar.error instanceof ErrorApi && guardar.error.estado === 400)
      ? mensajeDeError(guardar.error)
      : intento && (Object.keys(erroresCampos).length > 0 || resultado.errores.length > 0)
        ? T.corregir
        : undefined;

  return (
    <form noValidate onSubmit={alEnviar} className="flex flex-col gap-5">
      <CabeceraPartidaFormulario
        valor={cabecera}
        onCambio={cambiarCabecera}
        sucursales={sucursales}
        errores={erroresCampos}
        soloLectura={soloLectura}
      />

      <DetallePartida
        filas={filas}
        cuentas={cuentas}
        totales={resultado}
        errores={erroresLineas}
        soloLectura={soloLectura}
        cuentasDisponibles={cuentasDisponibles}
        onAgregar={(c) =>
          cambiarFilas((fs) => [
            ...fs,
            { clave: nuevaClave(), cuentaId: c.id, codigo: c.codigo, nombre: c.nombre, debe: "", haber: "" },
          ])
        }
        onCambiarMonto={(clave, lado, valor) =>
          cambiarFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, [lado]: valor } : f)))
        }
        onQuitar={(clave) => cambiarFilas((fs) => fs.filter((f) => f.clave !== clave))}
      />
      {erroresCampos.lineas?.[0] && (
        <p role="alert" className="-mt-3 text-sm text-destructive">
          {erroresCampos.lineas[0]}
        </p>
      )}

      {errorGeneral && <Alert variant="error">{errorGeneral}</Alert>}

      {!soloLectura && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <EstadoCuadre
            lineas={filas.length}
            totalDebe={resultado.totalDebe}
            totalHaber={resultado.totalHaber}
            diferencia={resultado.diferencia}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full px-5"
              onClick={() => (sinCambios ? onSalir() : setConfirmarSalida(true))}
            >
              {T.cancelar}
            </Button>
            <Button
              type="submit"
              variant={acciones ? "outline" : "default"}
              className="h-11 rounded-full px-5"
              disabled={guardar.isPending || !filas.length}
            >
              {guardar.isPending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {guardar.isPending ? T.guardando : T.guardar}
            </Button>
            {acciones?.({ cuadra: resultado.puedeContabilizarse, sinCambios })}
          </div>
        </div>
      )}

      <Dialog open={confirmarSalida} onOpenChange={setConfirmarSalida}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{T.salirTitulo}</DialogTitle>
            <DialogDescription>{T.salirDescripcion}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmarSalida(false)}>
              {T.seguirEditando}
            </Button>
            <Button type="button" variant="destructive" onClick={onSalir}>
              {T.salir}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
