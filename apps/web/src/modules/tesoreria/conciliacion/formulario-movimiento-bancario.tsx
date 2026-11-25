import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { crearMovimientoBancarioSchema, type CuentaTesoreriaVista } from "@contable/shared";
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
import type { SucursalDetalle } from "@contable/shared";
import { useCrearMovimientoBancario } from "./movimientos-bancarios-api";
import { TEXTOS_CAJA_CHICA as T } from "./textos";

interface Valores {
  cuentaTesoreriaId: string;
  sucursalId: string;
  cuentaContrapartidaId: string;
  tipo: "cheque" | "remesa" | "nota_cargo" | "nota_abono";
  fecha: string;
  referencia: string;
  comprobante: string;
  beneficiario: string;
  concepto: string;
  monto: string;
}

interface Props {
  empresaId: string;
  abierto: boolean;
  cuentas: readonly CuentaTesoreriaVista[];
  catalogo: readonly CuentaCatalogo[];
  sucursales: readonly SucursalDetalle[];
  onCerrar: () => void;
}

export function FormularioMovimientoBancario(props: Props) {
  return (
    <Dialog open={props.abierto} onOpenChange={(abierto) => !abierto && props.onCerrar()}>
      <DialogContent className="sm:max-w-2xl">{props.abierto && <Contenido {...props} />}</DialogContent>
    </Dialog>
  );
}

function Contenido({ empresaId, cuentas, catalogo, sucursales, onCerrar }: Props) {
  const bancos = cuentas.filter((cuenta) => cuenta.tipo === "banco" && cuenta.activa);
  const [valores, setValores] = useState<Valores>({
    cuentaTesoreriaId: bancos[0]?.id ?? "",
    sucursalId: bancos[0]?.sucursalId ?? sucursales[0]?.id ?? "",
    cuentaContrapartidaId: "",
    tipo: "cheque",
    fecha: hoyIso(),
    referencia: "",
    comprobante: "",
    beneficiario: "",
    concepto: "",
    monto: "",
  });
  const [errores, setErrores] = useState<ErroresPorCampo>({});
  const crear = useCrearMovimientoBancario(empresaId);
  const textos = T.movimientos.formulario;

  function cambiar(campo: keyof Valores, valor: string) {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
    setErrores(({ [campo]: _anterior, ...resto }) => resto);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (crear.isPending) return;
    crear.reset();
    const resultado = validarFormulario(crearMovimientoBancarioSchema, valores);
    if (!resultado.ok) return setErrores(resultado.errores);
    crear.mutate(resultado.datos, {
      onSuccess: () => {
        toast.success(T.movimientos.guardado);
        onCerrar();
      },
      onError: (error) => {
        if (error instanceof ErrorApi) setErrores(error.errores);
      },
    });
  }

  const error = (campo: keyof Valores) => errores[campo]?.[0];
  const aviso = errores._formulario?.[0] ?? (crear.error ? mensajeDeError(crear.error) : undefined);
  const cuentaElegida = bancos.find((cuenta) => cuenta.id === valores.cuentaTesoreriaId);
  const sucursalesDisponibles = cuentaElegida?.sucursalId
    ? sucursales.filter((sucursal) => sucursal.id === cuentaElegida.sucursalId)
    : sucursales;

  return (
    <form noValidate onSubmit={enviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{textos.titulo}</DialogTitle>
        <DialogDescription>{textos.descripcion}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="mov-banco" etiqueta={textos.cuenta} error={error("cuentaTesoreriaId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.cuentaTesoreriaId}
              onChange={(evento) => {
                const cuenta = bancos.find((item) => item.id === evento.target.value);
                setValores((actuales) => ({
                  ...actuales,
                  cuentaTesoreriaId: evento.target.value,
                  sucursalId: cuenta?.sucursalId ?? sucursales[0]?.id ?? "",
                }));
              }}
            >
              <option value="">{textos.cuenta}</option>
              {bancos.map((cuenta) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="mov-sucursal" etiqueta={textos.sucursal} error={error("sucursalId")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.sucursalId}
              onChange={(evento) => cambiar("sucursalId", evento.target.value)}
            >
              <option value="">{textos.sucursal}</option>
              {sucursalesDisponibles.map((sucursal) => (
                <option key={sucursal.id} value={sucursal.id}>
                  {sucursal.nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="mov-tipo" etiqueta={textos.tipo} error={error("tipo")}>
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.tipo}
              onChange={(evento) => cambiar("tipo", evento.target.value)}
            >
              {Object.entries(T.movimientos.tipos).map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </NativeSelect>
          )}
        </Campo>
        <Campo id="mov-fecha" etiqueta={textos.fecha} error={error("fecha")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              type="date"
              value={valores.fecha}
              onChange={(evento) => cambiar("fecha", evento.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="mov-referencia" etiqueta={textos.referencia} error={error("referencia")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={60}
              value={valores.referencia}
              onChange={(evento) => cambiar("referencia", evento.target.value)}
            />
          )}
        </Campo>
        <Campo id="mov-comprobante" etiqueta={textos.comprobante} error={error("comprobante")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={60}
              value={valores.comprobante}
              onChange={(evento) => cambiar("comprobante", evento.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="mov-beneficiario" etiqueta={textos.beneficiario} error={error("beneficiario")}>
          {(p) => (
            <Input
              {...p}
              className="h-10"
              maxLength={150}
              value={valores.beneficiario}
              onChange={(evento) => cambiar("beneficiario", evento.target.value)}
            />
          )}
        </Campo>
        <Campo
          id="mov-cuenta-contrapartida"
          etiqueta="Cuenta contable"
          error={error("cuentaContrapartidaId")}
        >
          {(p) => (
            <NativeSelect
              {...p}
              className="h-10"
              value={valores.cuentaContrapartidaId}
              onChange={(evento) => cambiar("cuentaContrapartidaId", evento.target.value)}
            >
              <option value="">Cuenta contable</option>
              {catalogo
                .filter((cuenta) => cuenta.activa && cuenta.imputable)
                .map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>{`${cuenta.codigo} ${cuenta.nombre}`}</option>
                ))}
            </NativeSelect>
          )}
        </Campo>
      </div>
      <Campo id="mov-concepto" etiqueta={textos.concepto} error={error("concepto")}>
        {(p) => (
          <Input
            {...p}
            className="h-10"
            maxLength={200}
            value={valores.concepto}
            onChange={(evento) => cambiar("concepto", evento.target.value)}
          />
        )}
      </Campo>
      <Campo id="mov-monto" etiqueta={textos.monto} error={error("monto")}>
        {(p) => (
          <Input
            {...p}
            className="h-10 tabular-nums"
            type="number"
            min="0.01"
            step="0.01"
            value={valores.monto}
            onChange={(evento) => cambiar("monto", evento.target.value)}
          />
        )}
      </Campo>
      {aviso && <Alert variant="error">{aviso}</Alert>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar} disabled={crear.isPending}>
          {textos.cancelar}
        </Button>
        <Button
          type="submit"
          disabled={
            crear.isPending || bancos.length === 0 || sucursales.length === 0 || catalogo.length === 0
          }
        >
          {crear.isPending ? textos.guardando : textos.guardar}
        </Button>
      </DialogFooter>
    </form>
  );
}
