import { useState } from "react";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { usePermiso } from "@/modules/organizacion/permisos";
import { Pestanas } from "@/modules/reportes/comun/pestanas";
import { ContenidoLiquidacionIva } from "../liquidacion-iva/contenido-liquidacion-iva";
import { mesPorDefecto } from "../pago-a-cuenta/mes-por-defecto";
import { ContenidoPagoACuenta, SelectorMes } from "../pago-a-cuenta/pantalla-pago-a-cuenta";
import { TEXTOS_DECLARACIONES as T } from "./textos";

type Declaracion = "f07" | "f14";

const OPCIONES: { valor: Declaracion; texto: string }[] = [
  { valor: "f07", texto: T.pestanas.f07 },
  { valor: "f14", texto: T.pestanas.f14 },
];

/**
 * Declaraciones mensuales del tributario: liquidación del IVA (F-07, HU-48) y pago a cuenta con retenciones de renta
 * (F-14, HU-49). Comparten el mes y el patrón de generar la partida y marcar como presentada.
 */
export function PantallaDeclaraciones({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("declaraciones.ver");
  const [activa, setActiva] = useState<Declaracion>("f07");
  const [periodo, setPeriodo] = useState(mesPorDefecto);

  return (
    <Pagina>
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeVer ? (
        <Alert>{T.sinPermiso}</Alert>
      ) : (
        <>
          <Pestanas
            etiqueta={T.declaraciones}
            valor={activa}
            opciones={OPCIONES}
            onCambio={setActiva}
            idPanel="panel-declaracion"
          />
          <SelectorMes valor={periodo} onCambio={setPeriodo} />
          <div
            id="panel-declaracion"
            role="tabpanel"
            aria-labelledby={`pestana-${activa}`}
            className="grid gap-5"
          >
            {activa === "f07" && (
              <ContenidoLiquidacionIva key={periodo} empresaId={empresaId} periodo={periodo} />
            )}
            {activa === "f14" && (
              <ContenidoPagoACuenta key={periodo} empresaId={empresaId} periodo={periodo} />
            )}
          </div>
        </>
      )}
    </Pagina>
  );
}
