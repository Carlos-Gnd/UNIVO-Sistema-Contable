import {
  clasificacionContribuyenteSchema,
  formatearNit,
  formatearNrc,
  modoNumeracionSchema,
  tipoContribuyenteSchema,
} from "@contable/shared";
import { Campo } from "@/components/campo";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ErroresPorCampo } from "@/lib/api";
import {
  ETIQUETA_CLASIFICACION,
  ETIQUETA_NUMERACION,
  ETIQUETA_TIPO_CONTRIBUYENTE,
  TEXTOS_EMPRESA,
} from "./textos";
import type { ValoresEmpresa } from "./valores";

const C = TEXTOS_EMPRESA.campos;

interface CamposEmpresaProps {
  valores: ValoresEmpresa;
  onCambio: (cambios: Partial<ValoresEmpresa>) => void;
  errores: ErroresPorCampo;
  soloLectura: boolean;
  /** Al editar, el tipo de contribuyente queda fijo */
  tipoFijo: boolean;
}

/** Datos fiscales de la empresa, compartidos por el registro y la edición (S1-T41). */
export function CamposEmpresa({ valores, onCambio, errores, soloLectura, tipoFijo }: CamposEmpresaProps) {
  const error = (campo: keyof ValoresEmpresa) => errores[campo]?.[0];
  const texto = (campo: keyof ValoresEmpresa) => ({
    value: valores[campo],
    disabled: soloLectura,
    onChange: (e: { target: { value: string } }) => onCambio({ [campo]: e.target.value }),
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Campo id="empresa-nombre" etiqueta={C.nombre} error={error("nombre")} className="sm:col-span-2">
        {(p) => (
          <Input {...p} {...texto("nombre")} className="h-10" maxLength={200} placeholder={C.nombreEjemplo} />
        )}
      </Campo>
      <Campo
        id="empresa-nombre-comercial"
        etiqueta={C.nombreComercial}
        ayuda={C.opcional}
        error={error("nombreComercial")}
      >
        {(p) => <Input {...p} {...texto("nombreComercial")} className="h-10" maxLength={200} />}
      </Campo>
      <Campo
        id="empresa-tipo"
        etiqueta={C.tipoContribuyente}
        ayuda={tipoFijo ? C.tipoNoEditable : undefined}
        error={error("tipoContribuyente")}
      >
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.tipoContribuyente}
            disabled={soloLectura || tipoFijo}
            onChange={(e) => onCambio({ tipoContribuyente: tipoContribuyenteSchema.parse(e.target.value) })}
          >
            {tipoContribuyenteSchema.options.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_CONTRIBUYENTE[t]}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <Campo
        id="empresa-nit"
        etiqueta={C.nit}
        ayuda={valores.tipoContribuyente === "sociedad" ? C.nitSociedad : C.nitNatural}
        error={error("nit")}
      >
        {(p) => (
          <Input
            {...p}
            {...texto("nit")}
            className="h-10 tabular-nums"
            inputMode="numeric"
            autoComplete="off"
            maxLength={17}
            onChange={(e) => onCambio({ nit: e.target.value.replace(/[^\d-]/g, "") })}
            // Al salir se aplica el formato con guiones si el número está completo (14 o 9 dígitos)
            onBlur={() => onCambio({ nit: formatearNit(valores.nit) })}
          />
        )}
      </Campo>
      <Campo id="empresa-nrc" etiqueta={C.nrc} ayuda={C.nrcAyuda} error={error("nrc")}>
        {(p) => (
          <Input
            {...p}
            {...texto("nrc")}
            className="h-10 tabular-nums"
            inputMode="numeric"
            autoComplete="off"
            maxLength={11}
            onChange={(e) => onCambio({ nrc: e.target.value.replace(/[^\d-]/g, "") })}
            onBlur={() => valores.nrc && onCambio({ nrc: formatearNrc(valores.nrc) })}
          />
        )}
      </Campo>
      <Campo
        id="empresa-actividad"
        etiqueta={C.actividadEconomica}
        ayuda={C.opcional}
        error={error("actividadEconomica")}
        className="sm:col-span-2"
      >
        {(p) => (
          <Input
            {...p}
            {...texto("actividadEconomica")}
            className="h-10"
            maxLength={200}
            placeholder={C.actividadEjemplo}
          />
        )}
      </Campo>
      <Campo
        id="empresa-clasificacion"
        etiqueta={C.clasificacion}
        ayuda={C.clasificacionAyuda}
        error={error("clasificacion")}
      >
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.clasificacion}
            disabled={soloLectura}
            onChange={(e) =>
              onCambio({ clasificacion: clasificacionContribuyenteSchema.parse(e.target.value) })
            }
          >
            {clasificacionContribuyenteSchema.options.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CLASIFICACION[c]}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <Campo
        id="empresa-numeracion"
        etiqueta={C.modoNumeracion}
        ayuda={C.modoNumeracionAyuda}
        error={error("modoNumeracion")}
      >
        {(p) => (
          <NativeSelect
            {...p}
            className="h-10"
            value={valores.modoNumeracion}
            disabled={soloLectura}
            onChange={(e) => onCambio({ modoNumeracion: modoNumeracionSchema.parse(e.target.value) })}
          >
            {modoNumeracionSchema.options.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_NUMERACION[m]}
              </option>
            ))}
          </NativeSelect>
        )}
      </Campo>
      <Campo id="empresa-telefono" etiqueta={C.telefono} ayuda={C.opcional} error={error("telefono")}>
        {(p) => (
          <Input
            {...p}
            {...texto("telefono")}
            className="h-10"
            type="tel"
            inputMode="tel"
            maxLength={20}
            placeholder="0000-0000"
          />
        )}
      </Campo>
      <Campo id="empresa-correo" etiqueta={C.correo} ayuda={C.opcional} error={error("correo")}>
        {(p) => (
          <Input
            {...p}
            {...texto("correo")}
            className="h-10"
            type="email"
            maxLength={150}
            placeholder={C.correoEjemplo}
          />
        )}
      </Campo>
      <Campo
        id="empresa-direccion"
        etiqueta={C.direccion}
        ayuda={C.opcional}
        error={error("direccion")}
        className="sm:col-span-2"
      >
        {(p) => <Textarea {...p} {...texto("direccion")} rows={2} maxLength={300} />}
      </Campo>
      <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">
        {valores.tipoContribuyente === "sociedad" ? TEXTOS_EMPRESA.notaSociedad : TEXTOS_EMPRESA.notaNatural}
      </p>
    </div>
  );
}
