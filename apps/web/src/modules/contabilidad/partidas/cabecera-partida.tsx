import { tipoPartidaSchema, type SucursalDetalle, type TipoPartida } from "@contable/shared";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ErroresPorCampo } from "@/lib/api";
import { TEXTOS_PARTIDA } from "./textos";
import { ETIQUETA_TIPO_PARTIDA } from "./tipos";
import type { CabeceraPartida } from "./valores";

const T = TEXTOS_PARTIDA.cabecera;

interface CabeceraPartidaProps {
  valor: CabeceraPartida;
  onCambio: (cambios: Partial<CabeceraPartida>) => void;
  sucursales: readonly SucursalDetalle[];
  errores: ErroresPorCampo;
  soloLectura: boolean;
}

const TIPOS = tipoPartidaSchema.options;

/** Cabecera de la partida: fecha, tipo, sucursal, documento de soporte y concepto (S1-T79). */
export function CabeceraPartidaFormulario({
  valor,
  onCambio,
  sucursales,
  errores,
  soloLectura,
}: CabeceraPartidaProps) {
  const error = (campo: keyof CabeceraPartida) => errores[campo]?.[0];
  const props = (campo: keyof CabeceraPartida) => ({
    id: `partida-${campo}`,
    name: campo,
    disabled: soloLectura,
    "aria-invalid": Boolean(error(campo)),
    "aria-describedby": error(campo) ? `partida-${campo}-error` : undefined,
  });
  const mensaje = (campo: keyof CabeceraPartida) =>
    error(campo) && <FieldError id={`partida-${campo}-error`}>{error(campo)}</FieldError>;

  return (
    <Card>
      <CardHeader title={T.titulo} />
      <div className="grid gap-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[170px_200px_minmax(0,1fr)]">
          <Field data-invalid={Boolean(error("fecha"))}>
            <FieldLabel htmlFor="partida-fecha">{T.fecha}</FieldLabel>
            <Input
              {...props("fecha")}
              type="date"
              required
              className="h-10 tabular-nums"
              value={valor.fecha}
              onChange={(e) => onCambio({ fecha: e.target.value })}
            />
            {mensaje("fecha")}
          </Field>
          <Field data-invalid={Boolean(error("tipo"))}>
            <FieldLabel htmlFor="partida-tipo">{T.tipo}</FieldLabel>
            <NativeSelect
              {...props("tipo")}
              className="h-10"
              value={valor.tipo}
              onChange={(e) => onCambio({ tipo: e.target.value as TipoPartida })}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_PARTIDA[t]}
                </option>
              ))}
            </NativeSelect>
            {mensaje("tipo")}
          </Field>
          <Field data-invalid={Boolean(error("sucursalId"))} className="sm:col-span-2 lg:col-span-1">
            <FieldLabel htmlFor="partida-sucursalId">{T.sucursal}</FieldLabel>
            <NativeSelect
              {...props("sucursalId")}
              className="h-10"
              required
              value={valor.sucursalId}
              onChange={(e) => onCambio({ sucursalId: e.target.value })}
            >
              <option value="" disabled>
                {sucursales.length ? T.sucursalVacia : T.sinSucursales}
              </option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} · {s.codigoEstablecimiento}
                </option>
              ))}
            </NativeSelect>
            {mensaje("sucursalId")}
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(error("documentoTipo"))}>
            <FieldLabel htmlFor="partida-documentoTipo">{T.documentoTipo}</FieldLabel>
            <Input
              {...props("documentoTipo")}
              className="h-10"
              maxLength={30}
              list="partida-tipos-documento"
              placeholder={T.documentoTipoEjemplo}
              value={valor.documentoTipo}
              onChange={(e) => onCambio({ documentoTipo: e.target.value })}
            />
            <datalist id="partida-tipos-documento">
              {["CCF", "Factura", "Recibo", "Nota de crédito", "Nota de débito", "Planilla", "Cheque"].map(
                (d) => (
                  <option key={d} value={d} />
                ),
              )}
            </datalist>
            {mensaje("documentoTipo") ?? <FieldDescription>{T.documentoTipoAyuda}</FieldDescription>}
          </Field>
          <Field data-invalid={Boolean(error("documentoNumero"))}>
            <FieldLabel htmlFor="partida-documentoNumero">{T.documentoNumero}</FieldLabel>
            <Input
              {...props("documentoNumero")}
              className="h-10"
              maxLength={60}
              placeholder={T.documentoNumeroEjemplo}
              value={valor.documentoNumero}
              onChange={(e) => onCambio({ documentoNumero: e.target.value })}
            />
            {mensaje("documentoNumero")}
          </Field>
        </div>
        <Field data-invalid={Boolean(error("concepto"))}>
          <FieldLabel htmlFor="partida-concepto">{T.concepto}</FieldLabel>
          <Textarea
            {...props("concepto")}
            rows={2}
            maxLength={1000}
            placeholder={T.conceptoEjemplo}
            value={valor.concepto}
            onChange={(e) => onCambio({ concepto: e.target.value })}
          />
          {mensaje("concepto") ?? <FieldDescription>{T.conceptoAyuda}</FieldDescription>}
        </Field>
      </div>
    </Card>
  );
}
