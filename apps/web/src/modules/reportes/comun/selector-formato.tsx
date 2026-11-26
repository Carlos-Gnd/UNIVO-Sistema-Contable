import { ETIQUETA_FORMATO, formatoEstadosSchema, type FormatoEstados } from "@contable/shared";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { TEXTOS_REPORTES } from "./textos";

interface SelectorFormatoProps {
  /** Lo que eligió el usuario; vacío = el formato configurado en la empresa */
  valor: FormatoEstados | "";
  /** Formato con el que se presentó el estado, para mostrar el de la empresa mientras no se elige otro */
  actual: FormatoEstados | undefined;
  onCambio: (formato: FormatoEstados) => void;
  id: string;
}

/** Elige el formato del estado al generarlo: de clase o NIIF para las PYMES (HU-42, S3-T26). */
export function SelectorFormato({ valor, actual, onCambio, id }: SelectorFormatoProps) {
  return (
    <Field className="w-full sm:w-[220px]">
      <FieldLabel htmlFor={id}>{TEXTOS_REPORTES.formato.etiqueta}</FieldLabel>
      <NativeSelect
        id={id}
        className="h-10"
        value={valor || actual || "clase"}
        onChange={(e) => onCambio(formatoEstadosSchema.parse(e.target.value))}
      >
        {formatoEstadosSchema.options.map((f) => (
          <option key={f} value={f}>
            {ETIQUETA_FORMATO[f]}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
