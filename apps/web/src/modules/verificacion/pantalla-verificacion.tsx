import { useState, type FormEvent } from "react";
import { CircleCheck, FileUp, LoaderCircle, ShieldCheck, ShieldX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { codigoVerificacionSchema, type VerificacionEstado } from "@contable/shared";
import { navegar } from "@/app/navegacion";
import type { Parametros } from "@/app/rutas";
import { Isologo } from "@/components/brand";
import { Campo } from "@/components/campo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorApi, mensajeDeError } from "@/lib/api";
import { formatearFecha } from "@/lib/formato";
import { useComprobarPdf, verificacionQuery } from "./verificacion-api";
import { TEXTOS_VERIFICACION as T } from "./textos";

const MAX_BYTES = 10 * 1024 * 1024;

const huellaCorta = (h: string) => (h.length > 24 ? `${h.slice(0, 12)}…${h.slice(-8)}` : h);

function Fila({ etiqueta, valor, titulo }: { etiqueta: string; valor: string; titulo?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right font-semibold break-all" title={titulo}>
        {valor}
      </dd>
    </div>
  );
}

function ResultadoPdf({ resultado }: { resultado: VerificacionEstado }) {
  const t = T.comprobar;
  const detalle = resultado.archivo;
  if (resultado.integro) {
    return (
      <Alert variant="info" role="status" className="border-emerald-600/40 text-foreground">
        <p className="flex items-center gap-1.5 font-semibold">
          <CircleCheck aria-hidden="true" className="size-4 text-emerald-600" />
          {t.integro}
        </p>
        <p className="mt-1 text-muted-foreground">{t.integroDetalle}</p>
      </Alert>
    );
  }
  return (
    <Alert variant="error">
      <p className="font-semibold">{t.alterado}</p>
      <p className="mt-1">{t.alteradoDetalle}</p>
      {detalle && (
        <ul className="mt-2 list-disc pl-5">
          <li>{detalle.coincideHuella ? t.huellaCoincide : t.huellaDifiere}</li>
          <li>{detalle.firmaValida ? t.firmaVigente : t.firmaInvalida}</li>
          <li className="break-all">
            {t.huellaArchivo}: {huellaCorta(detalle.huella)}
          </li>
        </ul>
      )}
    </Alert>
  );
}

function ComprobarPdf({ codigo }: { codigo: string }) {
  const t = T.comprobar;
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string>();
  const comprobar = useComprobarPdf(codigo);

  const elegir = (nuevo: File | null) => {
    setArchivo(nuevo);
    setErrorArchivo(undefined);
    comprobar.reset();
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!archivo) return setErrorArchivo(t.sinArchivo);
    if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf"))
      return setErrorArchivo(t.noEsPdf);
    if (archivo.size > MAX_BYTES) return setErrorArchivo(t.demasiadoGrande);
    comprobar.mutate(archivo);
  };

  return (
    <form onSubmit={enviar} noValidate className="grid gap-3 rounded-2xl bg-secondary p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FileUp aria-hidden="true" className="size-4" />
        {t.titulo}
      </h2>
      <Campo id="verificacion-pdf" etiqueta={t.campo} ayuda={t.ayuda} error={errorArchivo}>
        {(props) => (
          <Input
            {...props}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => elegir(e.target.files?.[0] ?? null)}
          />
        )}
      </Campo>
      <div>
        <Button type="submit" disabled={comprobar.isPending}>
          {comprobar.isPending ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              {t.comprobando}
            </>
          ) : (
            t.boton
          )}
        </Button>
      </div>
      {comprobar.isError && <Alert variant="error">{`${t.error} ${mensajeDeError(comprobar.error)}`}</Alert>}
      {comprobar.data && <ResultadoPdf resultado={comprobar.data} />}
    </form>
  );
}

function DatosFirma({ datos }: { datos: VerificacionEstado }) {
  const d = T.datos;
  const c = datos.certificado;
  return (
    <Card className="grid gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{T.firmaValida}</h2>
          <p className="text-sm text-muted-foreground">{T.firmaValidaDetalle}</p>
        </div>
      </div>
      <dl className="grid gap-2.5 text-sm">
        <Fila etiqueta={d.empresa} valor={datos.empresa} />
        <Fila etiqueta={d.nit} valor={datos.nit} />
        <Fila etiqueta={d.documento} valor={datos.titulo} />
        <Fila etiqueta={d.periodo} valor={datos.periodo} />
        <Fila etiqueta={d.firmadoEl} valor={formatearFecha(datos.firmadoEn)} />
        <Fila etiqueta={d.firmante} valor={datos.firmante} />
        <Fila etiqueta={d.cargo} valor={datos.cargo} />
        <Fila etiqueta={d.certificado} valor={c.titular} />
        <Fila etiqueta={d.emisor} valor={c.emisor} />
        <Fila
          etiqueta={d.vigencia}
          valor={T.vigencia(formatearFecha(c.validoDesde), formatearFecha(c.validoHasta))}
        />
        <Fila etiqueta={d.serie} valor={c.numeroSerie} />
        <Fila etiqueta={d.huella} valor={huellaCorta(datos.huellaDocumento)} titulo={datos.huellaDocumento} />
      </dl>
      <ComprobarPdf codigo={datos.codigoVerificacion} />
    </Card>
  );
}

function Consulta({ codigo }: { codigo: string }) {
  const consulta = useQuery(verificacionQuery(codigo));
  if (consulta.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {T.cargando}
      </p>
    );
  }
  if (consulta.isError) {
    const noEncontrado = consulta.error instanceof ErrorApi && consulta.error.estado === 404;
    if (noEncontrado) {
      return (
        <Alert variant="error">
          <p className="flex items-center gap-1.5 font-semibold">
            <ShieldX aria-hidden="true" className="size-4" />
            {T.noEncontrado}
          </p>
          <p className="mt-1">{T.noEncontradoDetalle}</p>
        </Alert>
      );
    }
    return (
      <Alert variant="error">
        <p>{`${T.errorConsulta} ${mensajeDeError(consulta.error)}`}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void consulta.refetch()}>
          {T.reintentar}
        </Button>
      </Alert>
    );
  }
  return <DatosFirma datos={consulta.data} />;
}

/** HU-88: portal público de verificación por código (o QR). No pide iniciar sesión. */
export function PantallaVerificacion({ parametros }: { parametros: Parametros }) {
  const codigoRuta = parametros.codigo;
  const [texto, setTexto] = useState(codigoRuta ?? "");
  const [errorCodigo, setErrorCodigo] = useState<string>();

  const codigoValido = codigoRuta === undefined ? null : codigoVerificacionSchema.safeParse(codigoRuta);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const analizado = codigoVerificacionSchema.safeParse(texto);
    if (!analizado.success) return setErrorCodigo(T.codigoInvalido);
    setErrorCodigo(undefined);
    navegar(`/verificar/${encodeURIComponent(analizado.data)}`);
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex h-16 max-w-[720px] items-center gap-3 px-4">
          <Isologo alto={32} />
          <b className="text-sm tracking-[.28em] text-muted-foreground">{T.marca}</b>
          <span className="text-sm text-muted-foreground">· {T.subtitulo}</span>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-[720px] content-start gap-6 px-4! py-10!">
        <div>
          <h1 className="text-[28px] font-normal tracking-tight sm:text-[32px]">{T.titulo}</h1>
          <p className="mt-1 text-muted-foreground">{T.descripcion}</p>
        </div>
        <form onSubmit={buscar} noValidate className="flex flex-wrap items-start gap-2">
          <Campo
            id="verificacion-codigo"
            etiqueta={T.campoCodigo}
            error={errorCodigo}
            className="min-w-[220px] flex-1"
          >
            {(props) => (
              <Input
                {...props}
                value={texto}
                onChange={(e) => setTexto(e.target.value.toUpperCase())}
                placeholder={T.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="h-10 font-mono"
              />
            )}
          </Campo>
          <Button type="submit" className="mt-6 h-10 px-5">
            {T.verificar}
          </Button>
        </form>
        {codigoValido?.success && <Consulta key={codigoValido.data} codigo={codigoValido.data} />}
        {codigoValido && !codigoValido.success && (
          <Alert variant="error">
            <p className="flex items-center gap-1.5 font-semibold">
              <ShieldX aria-hidden="true" className="size-4" />
              {T.noEncontrado}
            </p>
            <p className="mt-1">{T.noEncontradoDetalle}</p>
          </Alert>
        )}
      </main>
    </div>
  );
}
