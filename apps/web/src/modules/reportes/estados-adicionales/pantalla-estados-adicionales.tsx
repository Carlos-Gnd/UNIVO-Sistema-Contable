import { useState } from "react";
import type { Parametros } from "@/app/rutas";
import { EncabezadoPagina, Pagina } from "@/components/pagina";
import { Alert } from "@/components/ui/alert";
import { usePermiso } from "@/modules/organizacion/permisos";
import { Pestanas } from "../comun/pestanas";
import { TEXTOS_REPORTES as R } from "../comun/textos";
import { PanelPatrimonio } from "./panel-patrimonio";
import { TEXTOS_ESTADOS_ADICIONALES as T } from "./textos";

type Pestana = "patrimonio";

const ID_PANEL = "panel-estados-adicionales";

/** Estados adicionales: cambios en el patrimonio (HU-40) y, en pestañas, los demás de la HU-41 a la HU-43. */
export function PantallaEstadosAdicionales({ parametros }: { parametros: Parametros }) {
  const empresaId = parametros.empresaId ?? "";
  const puedeVer = usePermiso("estados.ver");
  const [pestana, setPestana] = useState<Pestana>("patrimonio");

  return (
    <Pagina className="max-w-[1100px]">
      <EncabezadoPagina titulo={T.titulo} descripcion={T.descripcion} />
      {!puedeVer ? (
        <Alert>{R.sinPermiso}</Alert>
      ) : (
        <>
          <Pestanas
            etiqueta={T.pestanas}
            valor={pestana}
            opciones={[{ valor: "patrimonio", texto: T.patrimonio.pestana }]}
            onCambio={setPestana}
            idPanel={ID_PANEL}
          />
          {pestana === "patrimonio" && <PanelPatrimonio empresaId={empresaId} idPanel={ID_PANEL} />}
        </>
      )}
    </Pagina>
  );
}
