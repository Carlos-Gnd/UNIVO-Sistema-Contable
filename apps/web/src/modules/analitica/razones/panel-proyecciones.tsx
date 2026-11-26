import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { formatearDinero, formatearFecha } from "@/lib/formato";
import { mensajeDeError } from "@/lib/api";
import { solicitarProyeccion, type ProyeccionFinanciera, type SupuestosProyeccion } from "./proyecciones-api";

const TEXTOS = {
  titulo: "Proyecciones",
  descripcion: "Estimaciones de los próximos meses basadas en el historial y los supuestos seleccionados.",
  horizonte: "Meses a proyectar",
  crecimientoVentas: "Cambio mensual de ventas (%)",
  crecimientoGastos: "Cambio mensual de gastos (%)",
  calcular: "Calcular proyección",
  calculando: "Calculando…",
  metodo: "Método según el historial",
  actualizado: (fecha: string) => `Calculado con datos hasta ${fecha}`,
  aviso: "La proyección es informativa y no crea partidas ni modifica los datos contables.",
  error: "No se pudo calcular la proyección.",
  vacio: "Ajusta los supuestos y calcula para ver las proyecciones.",
  mes: "Mes",
  estimado: "Estimado",
  rango: "Rango de confianza",
  ventas: "Ventas",
  gastos: "Gastos",
  utilidad: "Utilidad",
  flujo: "Flujo de efectivo",
  iva: "IVA",
  metodos: {
    "promedio-movil": "Promedio móvil",
    regresion: "Regresión",
    "holt-winters": "Holt-Winters",
  },
} as const;

const ETIQUETAS_VALOR = [
  { clave: "ventas", texto: TEXTOS.ventas },
  { clave: "gastos", texto: TEXTOS.gastos },
  { clave: "utilidad", texto: TEXTOS.utilidad },
  { clave: "flujoEfectivo", texto: TEXTOS.flujo },
  { clave: "iva", texto: TEXTOS.iva },
] as const;

function leerNumero(valor: string): number | null {
  if (!valor.trim()) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function formatearRango(minimo: string, maximo: string): string {
  return `${formatearDinero(minimo)} – ${formatearDinero(maximo)}`;
}

function Resultados({ proyeccion }: { proyeccion: ProyeccionFinanciera }) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title={TEXTOS.titulo}
          description={`${TEXTOS.metodo}: ${TEXTOS.metodos[proyeccion.metodo]} · ${TEXTOS.actualizado(formatearFecha(proyeccion.calculadaConDatosHasta))}`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" rowSpan={2} className="px-4 py-3">
                  {TEXTOS.mes}
                </th>
                {ETIQUETAS_VALOR.map(({ clave, texto }) => (
                  <th key={clave} scope="colgroup" colSpan={2} className="px-4 py-3 text-center">
                    {texto}
                  </th>
                ))}
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                {ETIQUETAS_VALOR.flatMap(({ clave }) => [
                  <th key={`${clave}-estimado`} scope="col" className="px-4 py-2 text-right">
                    {TEXTOS.estimado}
                  </th>,
                  <th key={`${clave}-rango`} scope="col" className="px-4 py-2 text-right">
                    {TEXTOS.rango}
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {proyeccion.periodos.map((periodo) => (
                <tr key={periodo.mes} className="border-b border-border last:border-0">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    {formatearFecha(periodo.mes)}
                  </th>
                  {ETIQUETAS_VALOR.flatMap(({ clave }) => {
                    const valor = periodo[clave];
                    return [
                      <td
                        key={`${clave}-estimado`}
                        className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums"
                      >
                        {formatearDinero(valor.estimado)}
                      </td>,
                      <td
                        key={`${clave}-rango`}
                        className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground tabular-nums"
                      >
                        {formatearRango(valor.minimo, valor.maximo)}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">{TEXTOS.aviso}</p>
    </div>
  );
}

export function PanelProyecciones({ empresaId }: { empresaId: string }) {
  const [meses, setMeses] = useState("3");
  const [crecimientoVentas, setCrecimientoVentas] = useState("0");
  const [crecimientoGastos, setCrecimientoGastos] = useState("0");
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const proyeccion = useMutation({
    mutationFn: (supuestos: SupuestosProyeccion) => solicitarProyeccion(empresaId, supuestos),
  });

  function calcular(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cantidadMeses = leerNumero(meses);
    const ventas = leerNumero(crecimientoVentas);
    const gastos = leerNumero(crecimientoGastos);
    if (
      cantidadMeses === null ||
      !Number.isInteger(cantidadMeses) ||
      cantidadMeses < 1 ||
      cantidadMeses > 24 ||
      ventas === null ||
      ventas < -100 ||
      ventas > 1000 ||
      gastos === null ||
      gastos < -100 ||
      gastos > 1000
    ) {
      setErrorValidacion("Usa de 1 a 24 meses y porcentajes entre -100 y 1000.");
      return;
    }
    setErrorValidacion(null);
    proyeccion.mutate({
      meses: cantidadMeses,
      crecimientoVentasMensual: ventas,
      crecimientoGastosMensual: gastos,
    });
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title={TEXTOS.titulo} description={TEXTOS.descripcion} />
        <form
          noValidate
          className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
          onSubmit={calcular}
        >
          <Field>
            <FieldLabel htmlFor="proyeccion-meses">{TEXTOS.horizonte}</FieldLabel>
            <Input
              id="proyeccion-meses"
              type="number"
              min="1"
              max="24"
              step="1"
              value={meses}
              onChange={(e) => setMeses(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="proyeccion-ventas">{TEXTOS.crecimientoVentas}</FieldLabel>
            <Input
              id="proyeccion-ventas"
              type="number"
              min="-100"
              max="1000"
              step="0.1"
              value={crecimientoVentas}
              onChange={(e) => setCrecimientoVentas(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="proyeccion-gastos">{TEXTOS.crecimientoGastos}</FieldLabel>
            <Input
              id="proyeccion-gastos"
              type="number"
              min="-100"
              max="1000"
              step="0.1"
              value={crecimientoGastos}
              onChange={(e) => setCrecimientoGastos(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={proyeccion.isPending}>
            <Calculator aria-hidden="true" />
            {proyeccion.isPending ? TEXTOS.calculando : TEXTOS.calcular}
          </Button>
        </form>
      </Card>
      {errorValidacion && (
        <Alert variant="error" role="alert">
          {errorValidacion}
        </Alert>
      )}
      {proyeccion.isError && (
        <Alert variant="error" role="alert">
          {TEXTOS.error} {mensajeDeError(proyeccion.error)}
        </Alert>
      )}
      {proyeccion.data ? (
        <Resultados proyeccion={proyeccion.data} />
      ) : !proyeccion.isError ? (
        <Card className="p-6 text-sm text-muted-foreground">{TEXTOS.vacio}</Card>
      ) : null}
    </div>
  );
}
