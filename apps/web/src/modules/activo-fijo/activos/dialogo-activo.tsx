import { useMemo, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  TASA_MAXIMA_FISCAL,
  CATEGORIAS_ACTIVO,
  crearActivoFijoSchema,
  tasaAnual,
  vidaMinimaAnios,
  type CategoriaActivo,
  type SucursalDetalle,
} from "@contable/shared";
import { Campo } from "@/components/campo";
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
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ErrorApi, mensajeDeError, type ErroresPorCampo } from "@/lib/api";
import { hoyIso } from "@/lib/formato";
import { validarFormulario } from "@/lib/validacion";
import type { CuentaCatalogo } from "@/modules/contabilidad/partidas/tipos";
import { useRegistrarActivo } from "./activos-api";
import { cuentasDePago } from "./cuentas-de-pago";
import { CATEGORIAS, TEXTOS_ACTIVOS } from "./textos";

const T = TEXTOS_ACTIVOS.formulario;

interface DialogoActivoProps {
  empresaId: string;
  abierto: boolean;
  sucursales: readonly SucursalDetalle[];
  cuentas: readonly CuentaCatalogo[];
  onCerrar: () => void;
}

/** Alta de un activo fijo con su vida útil sugerida por el porcentaje fiscal de la categoría (S3-T128, HU-81). */
export function DialogoActivo(props: DialogoActivoProps) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {props.abierto && <Formulario {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ empresaId, sucursales, cuentas, onCerrar }: DialogoActivoProps) {
  const registrar = useRegistrarActivo(empresaId);
  const pagos = useMemo(() => cuentasDePago(cuentas), [cuentas]);
  const activas = sucursales.filter((s) => s.activa);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<CategoriaActivo>("mobiliario_equipo");
  const [sucursalId, setSucursalId] = useState(activas.find((s) => s.esMatriz)?.id ?? activas[0]?.id ?? "");
  const [costo, setCosto] = useState("");
  const [residual, setResidual] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const [vida, setVida] = useState(String(vidaMinimaAnios("mobiliario_equipo")));
  const [previa, setPrevia] = useState("");
  const [ultimoMes, setUltimoMes] = useState("");
  const [pago, setPago] = useState("");
  const [errores, setErrores] = useState<ErroresPorCampo>({});

  const vidaNumero = Number(vida);
  const quitar = (campo: string) => setErrores(({ [campo]: _quitado, ...resto }) => resto);

  function elegirCategoria(valor: CategoriaActivo) {
    setCategoria(valor);
    // La vida mínima de la nueva categoría es la sugerencia mientras no se haya escrito una mayor
    if (!vidaNumero || vidaNumero < vidaMinimaAnios(valor) || vidaNumero === vidaMinimaAnios(categoria)) {
      setVida(String(vidaMinimaAnios(valor)));
    }
  }

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (registrar.isPending) return;
    registrar.reset();
    const r = validarFormulario(crearActivoFijoSchema, {
      nombre,
      categoria,
      sucursalId,
      costo,
      valorResidual: residual,
      fechaAdquisicion: fecha,
      vidaUtilAnios: vida.trim() === "" ? undefined : vidaNumero,
      contrapartidaId: pago,
      depreciacionAcumulada: previa,
      ultimoMesDepreciado: ultimoMes,
    });
    if (!r.ok) return setErrores(r.errores);
    setErrores({});
    registrar.mutate(r.datos, {
      onSuccess: (resultado) => {
        toast.success(
          resultado.partida
            ? T.exitoConPartida(resultado.activo.codigo, resultado.partida.numero)
            : T.exito(resultado.activo.codigo),
        );
        onCerrar();
      },
      onError: (error) => error instanceof ErrorApi && setErrores(error.errores),
    });
  }

  const error = registrar.error;
  const aviso =
    error && !(error instanceof ErrorApi && error.estado === 400 && error.errores)
      ? mensajeDeError(error)
      : null;
  const pendiente = registrar.isPending;

  return (
    <form noValidate onSubmit={alEnviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{T.titulo}</DialogTitle>
        <DialogDescription>{T.descripcion}</DialogDescription>
      </DialogHeader>

      <Campo id="activo-nombre" etiqueta={T.nombre} error={errores["nombre"]?.[0]}>
        {(p) => (
          <Input
            {...p}
            autoFocus
            maxLength={200}
            value={nombre}
            disabled={pendiente}
            onChange={(e) => {
              setNombre(e.target.value);
              quitar("nombre");
            }}
          />
        )}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="activo-categoria"
          etiqueta={T.categoria}
          ayuda={T.categoriaAyuda(String(TASA_MAXIMA_FISCAL[categoria]), vidaMinimaAnios(categoria))}
          error={errores["categoria"]?.[0]}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={categoria}
              disabled={pendiente}
              onChange={(e) => elegirCategoria(e.target.value as CategoriaActivo)}
            >
              {CATEGORIAS_ACTIVO.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIAS[c]}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="activo-sucursal" etiqueta={T.sucursal} error={errores["sucursalId"]?.[0]}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={sucursalId}
              disabled={pendiente}
              onChange={(e) => setSucursalId(e.target.value)}
            >
              {activas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="activo-costo" etiqueta={T.costo} error={errores["costo"]?.[0]}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10 text-right tabular-nums"
              value={costo}
              disabled={pendiente}
              onChange={(e) => {
                setCosto(e.target.value.replace(/[^\d.]/g, ""));
                quitar("costo");
                quitar("valorResidual");
              }}
            />
          )}
        </Campo>
        <Campo id="activo-residual" etiqueta={T.residual} error={errores["valorResidual"]?.[0]}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10 text-right tabular-nums"
              placeholder="0.00"
              value={residual}
              disabled={pendiente}
              onChange={(e) => {
                setResidual(e.target.value.replace(/[^\d.]/g, ""));
                quitar("valorResidual");
              }}
            />
          )}
        </Campo>
        <Campo id="activo-fecha" etiqueta={T.fecha} error={errores["fechaAdquisicion"]?.[0]}>
          {(p) => (
            <Input
              {...p}
              type="date"
              className="h-10 tabular-nums"
              value={fecha}
              disabled={pendiente}
              onChange={(e) => {
                setFecha(e.target.value);
                quitar("fechaAdquisicion");
              }}
            />
          )}
        </Campo>
        <Campo
          id="activo-vida"
          etiqueta={T.vida}
          ayuda={vidaNumero > 0 ? T.vidaAyuda(tasaAnual(vidaNumero)) : undefined}
          error={errores["vidaUtilAnios"]?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              className="h-10 text-right tabular-nums"
              value={vida}
              disabled={pendiente}
              onChange={(e) => {
                setVida(e.target.value.replace(/\D/g, ""));
                quitar("vidaUtilAnios");
              }}
            />
          )}
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="activo-previa"
          etiqueta={T.previa}
          ayuda={T.previaAyuda}
          error={errores["depreciacionAcumulada"]?.[0]}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              className="h-10 text-right tabular-nums"
              value={previa}
              disabled={pendiente}
              onChange={(e) => {
                setPrevia(e.target.value.replace(/[^\d.]/g, ""));
                quitar("depreciacionAcumulada");
              }}
            />
          )}
        </Campo>
        <Campo id="activo-ultimo-mes" etiqueta={T.ultimoMes} error={errores["ultimoMesDepreciado"]?.[0]}>
          {(p) => (
            <Input
              {...p}
              type="month"
              className="h-10 tabular-nums"
              value={ultimoMes}
              disabled={pendiente}
              onChange={(e) => {
                setUltimoMes(e.target.value);
                quitar("ultimoMesDepreciado");
              }}
            />
          )}
        </Campo>
      </div>

      <Campo id="activo-metodo" etiqueta={T.metodo}>
        {(p) => (
          <NativeSelect {...p} className="h-10" disabled>
            <option>{T.metodoValor}</option>
          </NativeSelect>
        )}
      </Campo>

      <Campo id="activo-pago" etiqueta={T.pago} ayuda={T.pagoAyuda} error={errores["contrapartidaId"]?.[0]}>
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={pago}
            disabled={pendiente}
            onChange={(e) => setPago(e.target.value)}
          >
            <option value="">{T.pagoSaldos}</option>
            {pagos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>

      {aviso && <Alert variant="error">{aviso}</Alert>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>
          {T.cancelar}
        </Button>
        <Button type="submit" disabled={pendiente}>
          {pendiente && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {pendiente ? T.guardando : T.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
